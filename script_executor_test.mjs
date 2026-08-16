import { spawn } from 'node:child_process';
const input = JSON.stringify({script:'function get_config(args){ return {ok:true,value:args.value}; }',function:'get_config',args:{value:42}});
const p=spawn(process.execPath,['script_executor.mjs']);let out='',err='';p.stdout.on('data',x=>out+=x);p.stderr.on('data',x=>err+=x);p.stdin.end(input);p.on('close',code=>{if(code||JSON.parse(out).value!==42){console.error(err||out);process.exit(1);}console.log('SCRIPT EXECUTOR PASS');});
