import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=join(fileURLToPath(new URL('.',import.meta.url)),'public');
const port=Number(process.env.PORT||9531);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8'};
createServer(async(req,res)=>{try{const pathname=new URL(req.url||'/', 'http://localhost').pathname;const file=join(root,pathname==='/'?'index.html':pathname);const body=await readFile(file);res.writeHead(200,{'content-type':types[extname(file)]||'application/octet-stream','cache-control':'no-store'});res.end(body)}catch{const body=await readFile(join(root,'index.html'));res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});res.end(body)}}).listen(port,'127.0.0.1',()=>console.log(`starmap generated target http://127.0.0.1:${port}`));
