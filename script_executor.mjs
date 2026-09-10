import fs from 'node:fs';
import vm from 'node:vm';

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
if (!input.script || !input.function) throw new Error('invalid_script_request');
if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(input.function)) throw new Error('invalid_function_name');
if (typeof input.script !== 'string' || input.script.length > 200000) throw new Error('script_too_large');
const blocked = /(?:constructor\s*\.\s*constructor|process\s*(?:\.|\[)\s*(?:binding|mainModule|env|versions)|globalThis\s*(?:\.|\[)\s*(?:process|require)|\brequire\s*\(|\bimport\s*\()/;
if (blocked.test(input.script)) throw new Error('forbidden_script_capability');
let argsJson;
try { argsJson = JSON.stringify(input.args ?? {}); } catch { throw new Error('invalid_script_args'); }
if (typeof argsJson !== 'string' || argsJson.length > 500000) throw new Error('script_args_too_large');
const context = vm.createContext({ __args_json: argsJson }, { codeGeneration: { strings: false, wasm: false } });
new vm.Script(`"use strict";\n${input.script}`).runInContext(context, { timeout: 1000 });
if (typeof context[input.function] !== 'function') throw new Error('function_not_found');
const result = new vm.Script(`"use strict"; JSON.stringify(${input.function}(JSON.parse(__args_json)))`).runInContext(context, { timeout: 1000 });
process.stdout.write(String(result));
