package main

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/dop251/goja"
	"github.com/google/uuid"
)

const (
	maxScriptSize = 64 << 10 // ponytail: same cap as historyBodyCap
)

// scriptRuntime wraps a goja VM for one send's pre+post script pair.
// A fresh VM is created per send.
type scriptRuntime struct {
	vm      *goja.Runtime
	console strings.Builder
}

func newScriptRuntime() *scriptRuntime {
	return &scriptRuntime{vm: goja.New()}
}

// consoleLine returns the captured console output and resets it.
func (sr *scriptRuntime) consoleLine() string {
	s := sr.console.String()
	sr.console.Reset()
	return s
}

func (sr *scriptRuntime) consoleWrite(level string, args []goja.Value) {
	if sr.console.Len() > 0 {
		sr.console.WriteByte('\n')
	}
	var parts []string
	for _, a := range args {
		parts = append(parts, a.String())
	}
	sr.console.WriteString("[" + level + "] " + strings.Join(parts, " "))
}

// injectGlobals adds all script API globals to the VM.
func (sr *scriptRuntime) injectGlobals(envVars map[string]string, sessionVars map[string]string) {
	vm := sr.vm

	// ---- console ----
	consoleObj := vm.NewObject()
	consoleObj.Set("log", func(call goja.FunctionCall) goja.Value {
		sr.consoleWrite("log", call.Arguments)
		return goja.Undefined()
	})
	consoleObj.Set("warn", func(call goja.FunctionCall) goja.Value {
		sr.consoleWrite("warn", call.Arguments)
		return goja.Undefined()
	})
	consoleObj.Set("error", func(call goja.FunctionCall) goja.Value {
		sr.consoleWrite("error", call.Arguments)
		return goja.Undefined()
	})
	vm.Set("console", consoleObj)

	// ---- env ----
	envObj := vm.NewObject()
	envObj.Set("get", func(call goja.FunctionCall) goja.Value {
		name := call.Argument(0).String()
		if v, ok := sessionVars[name]; ok {
			return vm.ToValue(v)
		}
		if v, ok := envVars[name]; ok {
			return vm.ToValue(v)
		}
		return goja.Undefined()
	})
	envObj.Set("set", func(call goja.FunctionCall) goja.Value {
		name := call.Argument(0).String()
		value := call.Argument(1).String()
		sessionVars[name] = value
		return goja.Undefined()
	})
	vm.Set("env", envObj)

	// ---- atob / btoa ----
	vm.Set("atob", func(call goja.FunctionCall) goja.Value {
		s := call.Argument(0).String()
		decoded, err := base64.StdEncoding.DecodeString(s)
		if err != nil {
			panic(vm.NewGoError(fmt.Errorf("atob: %w", err)))
		}
		return vm.ToValue(string(decoded))
	})
	vm.Set("btoa", func(call goja.FunctionCall) goja.Value {
		return vm.ToValue(base64.StdEncoding.EncodeToString([]byte(call.Argument(0).String())))
	})

	// ---- crypto ----
	cryptoObj := vm.NewObject()
	cryptoObj.Set("randomUUID", func(call goja.FunctionCall) goja.Value {
		return vm.ToValue(uuid.New().String())
	})
	vm.Set("crypto", cryptoObj)

	// ---- sleep(ms) — synchronous ----
	vm.Set("sleep", func(call goja.FunctionCall) goja.Value {
		ms := call.Argument(0).ToInteger()
		time.Sleep(time.Duration(ms) * time.Millisecond)
		return goja.Undefined()
	})

	// ---- fetch(url) — synchronous ----
	vm.Set("fetch", func(call goja.FunctionCall) goja.Value {
		urlStr := call.Argument(0).String()

		client := &http.Client{Timeout: 30 * time.Second}
		resp, err := client.Get(urlStr)
		if err != nil {
			panic(vm.NewGoError(fmt.Errorf("fetch: %w", err)))
		}
		defer resp.Body.Close()

		bodyBytes, err := io.ReadAll(io.LimitReader(resp.Body, maxResponseSize))
		if err != nil {
			panic(vm.NewGoError(fmt.Errorf("fetch: reading body: %w", err)))
		}
		bodyStr := string(bodyBytes)

		obj := vm.NewObject()
		obj.Set("status", resp.StatusCode)
		obj.Set("statusText", http.StatusText(resp.StatusCode))
		obj.Set("headers", resp.Header)
		obj.Set("text", func() string { return bodyStr })
		obj.Set("json", func() goja.Value {
			var result interface{}
			if err := json.Unmarshal([]byte(bodyStr), &result); err != nil {
				panic(vm.NewGoError(fmt.Errorf("JSON parse error: %w", err)))
			}
			return vm.ToValue(result)
		})
		return obj
	})
}

// runPreScript executes the pre-request script. Returns the (possibly mutated)
// request, console output, and any script error. An empty script is a no-op.
func (sr *scriptRuntime) runPreScript(script string, in *RequestInput, envVars map[string]string, sessionVars map[string]string) (*RequestInput, string, error) {
	script = strings.TrimSpace(script)
	if script == "" {
		return in, "", nil
	}
	if len(script) > maxScriptSize {
		return nil, "", fmt.Errorf("pre-request script exceeds %d byte limit (%d bytes)", maxScriptSize, len(script))
	}

	sr.injectGlobals(envVars, sessionVars)

	// Build a JS-friendly request object (plain goja Object so mutations stick).
	reqObj := sr.requestToJS(in)
	sr.vm.Set("request", reqObj)
	sr.vm.Set("response", goja.Undefined())

	_, err := sr.vm.RunString(script)
	log := sr.consoleLine()
	if err != nil {
		return nil, log, err
	}

	// Read back the (possibly mutated) request from the JS object.
	modified := sr.jsToRequest(reqObj)
	return modified, log, nil
}

// runPostScript executes the post-response script. Returns the (possibly mutated)
// response, console output, and any script error. An empty script is a no-op.
// resolvedReq is the request as sent (after substitution, auth, URL assembly).
func (sr *scriptRuntime) runPostScript(script string, resolvedReq *RequestInput, resp *ResponseData, envVars map[string]string, sessionVars map[string]string) (*ResponseData, string, error) {
	script = strings.TrimSpace(script)
	if script == "" {
		return resp, "", nil
	}
	if len(script) > maxScriptSize {
		return resp, "", fmt.Errorf("post-response script exceeds %d byte limit (%d bytes)", maxScriptSize, len(script))
	}

	sr.injectGlobals(envVars, sessionVars)

	// Post-response: request is the RESOLVED request (read-only conceptually,
	// but we set it as a plain object — mutations are harmless since the send
	// is done).
	reqObj := sr.requestToJS(resolvedReq)
	sr.vm.Set("request", reqObj)

	// Response is mutable.
	respObj := sr.responseToJS(resp)
	sr.vm.Set("response", respObj)

	_, err := sr.vm.RunString(script)
	log := sr.consoleLine()
	if err != nil {
		// On error, return the original response unchanged — the user still
		// sees the HTTP response, and the error appears in the script log.
		return resp, log, err
	}

	modified := sr.jsToResponse(respObj)
	return modified, log, nil
}

// ---- JS object constructors ----

func (sr *scriptRuntime) requestToJS(in *RequestInput) goja.Value {
	vm := sr.vm
	obj := vm.NewObject()
	obj.Set("method", in.Method)
	obj.Set("url", in.URL)

	// Build KV arrays as Go slices — goja auto-converts to JS arrays of {key,value}.
	params := make([]map[string]string, len(in.Params))
	for i, p := range in.Params {
		params[i] = map[string]string{"key": p.Key, "value": p.Value}
	}
	obj.Set("params", vm.ToValue(params))
	headers := make([]map[string]string, len(in.Headers))
	for i, h := range in.Headers {
		headers[i] = map[string]string{"key": h.Key, "value": h.Value}
	}
	obj.Set("headers", vm.ToValue(headers))

	obj.Set("body", in.Body)
	obj.Set("auth", vm.ToValue(map[string]interface{}{
		"type":     in.Auth.Type,
		"token":    in.Auth.Token,
		"username": in.Auth.Username,
		"password": in.Auth.Password,
	}))
	obj.Set("options", vm.ToValue(map[string]interface{}{
		"timeoutSec":        in.Options.TimeoutSec,
		"noFollowRedirects": in.Options.NoFollowRedirects,
		"skipTlsVerify":     in.Options.SkipTLSVerify,
	}))
	return obj
}

func (sr *scriptRuntime) jsToRequest(val goja.Value) *RequestInput {
	obj := val.ToObject(sr.vm)
	authObj := obj.Get("auth").ToObject(sr.vm)
	optsObj := obj.Get("options").ToObject(sr.vm)
	return &RequestInput{
		Method:  obj.Get("method").String(),
		URL:     obj.Get("url").String(),
		Params:  sr.jsToKVList(obj.Get("params")),
		Headers: sr.jsToKVList(obj.Get("headers")),
		Body:    obj.Get("body").String(),
		Auth: Auth{
			Type:     authObj.Get("type").String(),
			Token:    authObj.Get("token").String(),
			Username: authObj.Get("username").String(),
			Password: authObj.Get("password").String(),
		},
		Options: SendOptions{
			TimeoutSec:        int(optsObj.Get("timeoutSec").ToInteger()),
			NoFollowRedirects: optsObj.Get("noFollowRedirects").ToBoolean(),
			SkipTLSVerify:     optsObj.Get("skipTlsVerify").ToBoolean(),
		},
	}
}

func (sr *scriptRuntime) jsToKVList(val goja.Value) KVList {
	obj := val.ToObject(sr.vm)
	length := int(obj.Get("length").ToInteger())
	out := make(KVList, 0, length)
	for i := range length {
		kv := obj.Get(fmt.Sprintf("%d", i)).ToObject(sr.vm)
		out = append(out, KV{
			Key:   kv.Get("key").String(),
			Value: kv.Get("value").String(),
		})
	}
	return out
}

func (sr *scriptRuntime) responseToJS(resp *ResponseData) goja.Value {
	vm := sr.vm
	obj := vm.NewObject()
	obj.Set("status", resp.Status)
	obj.Set("statusText", resp.StatusText)
	obj.Set("headers", vm.ToValue(resp.Headers))
	obj.Set("body", resp.Body)
	obj.Set("durationMs", resp.DurationMs)
	obj.Set("size", resp.Size)
	obj.Set("truncated", resp.Truncated)
	obj.Set("finalUrl", resp.FinalURL)
	// response.json() method
	bodyStr := resp.Body
	obj.Set("json", func() goja.Value {
		var result interface{}
		if err := json.Unmarshal([]byte(bodyStr), &result); err != nil {
			panic(vm.NewGoError(fmt.Errorf("JSON parse error: %w", err)))
		}
		return vm.ToValue(result)
	})
	return obj
}

func (sr *scriptRuntime) jsToResponse(val goja.Value) *ResponseData {
	obj := val.ToObject(sr.vm)
	headersVal := obj.Get("headers").Export()
	headers, _ := headersVal.(map[string][]string)
	if headers == nil {
		headers = map[string][]string{}
	}
	return &ResponseData{
		Status:     int(obj.Get("status").ToInteger()),
		StatusText: obj.Get("statusText").String(),
		Headers:    headers,
		Body:       obj.Get("body").String(),
		DurationMs: obj.Get("durationMs").ToInteger(),
		Size:       int(obj.Get("size").ToInteger()),
		Truncated:  obj.Get("truncated").ToBoolean(),
		FinalURL:   obj.Get("finalUrl").String(),
	}
}
