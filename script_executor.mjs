import fs from 'node:fs';
import vm from 'node:vm';

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
if (!input.script || !input.function) throw new Error('invalid_script_request');
const allowed = new Set(['get_config', 'get_notice', 'get_security_parameters', 'cs']);
if (!allowed.has(input.function)) throw new Error('function_not_allowed');
const sandbox = Object.freeze({ console: Object.freeze({ log() {} }) });
const context = vm.createContext({ ...sandbox, __args: input.args || {} });
// 先加载脚本，再通过固定入口调用函数，避免把函数名拼接进可执行代码。
new vm.Script(input.script).runInContext(context, { timeout: 1000 });
if (typeof context[input.function] !== 'function') throw new Error('function_not_found');
const result = new vm.Script(`JSON.stringify(${input.function}(__args))`).runInContext(context, { timeout: 1000 });
const output = await Promise.race([result, new Promise((_, reject) => setTimeout(() => reject(new Error('script_timeout')), 1200))]);
process.stdout.write(String(output));
