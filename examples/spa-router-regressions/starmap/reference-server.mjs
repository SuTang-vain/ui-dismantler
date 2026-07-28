import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const root=process.env.STARMAP_SOURCE_DIST||'/Users/tangyaoyue/DEV/Baidu/starmap_agent/frontend/dist';
const port=Number(process.env.PORT||9530);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png'};
createServer(async(req,res)=>{try{const pathname=decodeURIComponent(new URL(req.url||'/', 'http://localhost').pathname);const candidate=normalize(join(root,pathname==='/'?'index.html':pathname));if(!candidate.startsWith(root))throw new Error('invalid path');const body=await readFile(candidate);res.writeHead(200,{'content-type':types[extname(candidate)]||'application/octet-stream','cache-control':'no-store'});res.end(body)}catch{const body=await readFile(join(root,'index.html'));res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});res.end(body)}}).listen(port,'127.0.0.1',()=>console.log(`starmap reference target http://127.0.0.1:${port}`));
