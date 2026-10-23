// Development server for the static dashboard and the same /api/chat handler as Vercel.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {GET,POST} from './api/chat.mjs';
const root=path.resolve('dist'),port=Number(process.env.PORT||8879);
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.pdf':'application/pdf','.gz':'application/octet-stream','.png':'image/png'};
http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://'+req.headers.host);
  if(url.pathname==='/api/chat'){
   if(!['GET','POST'].includes(req.method)){res.writeHead(405);res.end();return;}
   const buffers=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>24000){res.writeHead(413);res.end();return;}buffers.push(chunk);}
   const request=new Request(url,{method:req.method,headers:req.headers,body:req.method==='POST'?Buffer.concat(buffers):undefined});
   const response=await (req.method==='POST'?POST(request):GET(request));res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
  }
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
  const file=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
  if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  const bytes=await fs.readFile(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(req.method==='HEAD'?undefined:bytes);
 }catch(error){res.writeHead(error.code==='ENOENT'?404:500);res.end('Recurso indisponível.');}
}).listen(port,'127.0.0.1',()=>console.log('Observatório: http://127.0.0.1:'+port));
