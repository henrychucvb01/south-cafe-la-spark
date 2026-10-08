// Only the disposable synthetic fixture. Never reads cloud connection settings.
const http=require('node:http');
const {spawn}=require('node:child_process');
const gateway=http.createServer((req,res)=>{
 const origin=req.headers.origin;
 if(origin&&!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)){res.writeHead(403).end();return;}
 res.setHeader('Access-Control-Allow-Origin',origin||'http://localhost:3000');
 res.setHeader('Access-Control-Allow-Headers','apikey,authorization,content-type,x-client-info,x-spark-session,prefer,range');
 res.setHeader('Access-Control-Allow-Methods','GET,POST,PATCH,DELETE,OPTIONS');
 if(req.method==='OPTIONS'){res.writeHead(204).end();return;}
 if(!req.url.startsWith('/rest/v1/')){res.writeHead(503).end('Local storage and external services are not configured.');return;}
 const headers={...req.headers};delete headers.authorization;delete headers.apikey;delete headers.host;
 const upstream=http.request({host:'127.0.0.1',port:55433,path:req.url.slice('/rest/v1'.length),method:req.method,headers},response=>{
  res.statusCode=response.statusCode;for(const [k,v]of Object.entries(response.headers))if(!k.startsWith('access-control-'))res.setHeader(k,v);response.pipe(res);
 });
 upstream.on('error',()=>{res.writeHead(503).end('Start the isolated local database/API first.');});req.pipe(upstream);
});
gateway.listen(55434,'127.0.0.1',()=>{
 const child=spawn(process.execPath,['node_modules/react-scripts/scripts/start.js'],{stdio:'inherit',windowsHide:true,env:{...process.env,HOST:'127.0.0.1',BROWSER:'none',REACT_APP_DEVELOPMENT_SUPABASE_URL:'http://127.0.0.1:55434',REACT_APP_DEVELOPMENT_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_local_fixture'}});
 child.on('exit',code=>{gateway.close();process.exitCode=code||0;});
 process.on('SIGINT',()=>{child.kill();gateway.close();});
});
