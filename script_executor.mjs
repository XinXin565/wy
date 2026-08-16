import fs from 'node:fs';
import vm from 'node:vm';

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
if (!input.script || !input.function) throw new Error('invalid_script_request');
const allowed = new Set(['get_config', 'get_notice', 'get_security_parameters']);
if (!allowed.has(input.function)) throw new Error('function_not_allowed');
const sandbox = Object.freeze({ console: Object.freeze({ log() {} }) });
const context = vm.createContext({ ...sandbox });
const code = `${input.script}\nif (typeof ${input.function} !== 'function') throw new Error('function_not_found');\nJSON.stringify(${input.function}(${JSON.stringify(input.args || {})}));`;
const result = new vm.Script(`(async()=>${code})()`).runInContext(context, { timeout: 1000 });
const output = await Promise.race([result, new Promise((_, reject) => setTimeout(() => reject(new Error('script_timeout')), 1200))]);
process.stdout.write(String(output));
