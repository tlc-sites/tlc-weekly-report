// 화요일 인쇄본 PDF를 구글 드라이브에 올리기 위한 refresh token을 한 번 발급한다.
// 사용: node scripts/google-drive-token.mjs <OAuth 클라이언트 ID> <클라이언트 보안 비밀번호>
// 1) 브라우저가 열리면 PDF를 받을 구글 계정으로 로그인해 허용한다.
// 2) 화면에 나온 refresh token을 Vercel 환경변수 GOOGLE_DRIVE_REFRESH_TOKEN에 넣는다. 토큰은 저장하지 않는다.
// 권한은 drive.file 하나뿐이다: 이 앱이 만든 폴더·파일만 볼 수 있고, 드라이브의 다른 파일은 볼 수 없다.
import http from 'node:http';
import {exec} from 'node:child_process';
import {randomBytes} from 'node:crypto';
const [clientId,clientSecret]=process.argv.slice(2);
if(!clientId||!clientSecret){console.error('사용: node scripts/google-drive-token.mjs <클라이언트 ID> <클라이언트 보안 비밀번호>');process.exit(1);}
const state=randomBytes(16).toString('hex');
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1');
 if(url.pathname!=='/callback'){res.writeHead(404).end();return;}
 const code=url.searchParams.get('code');
 if(url.searchParams.get('state')!==state||!code){res.writeHead(400,{'Content-Type':'text/plain; charset=utf-8'}).end('허용하지 않았거나 요청이 맞지 않습니다. 터미널을 확인해 주세요.');console.error('실패:',url.searchParams.get('error')??'state 불일치');server.close();return;}
 const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({code,client_id:clientId,client_secret:clientSecret,redirect_uri:redirect,grant_type:'authorization_code'})});
 const body=await r.json();
 res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8'}).end(body.refresh_token?'완료했습니다. 이 창을 닫고 터미널을 확인해 주세요.':'refresh token을 받지 못했습니다. 터미널을 확인해 주세요.');
 if(body.refresh_token)console.log('\nGOOGLE_DRIVE_REFRESH_TOKEN=\n'+body.refresh_token+'\n\n위 값을 Vercel 환경변수에 넣어 주세요. 다른 사람에게 보내지 마세요.');
 else console.error('실패:',body.error,body.error_description);
 server.close();
});
let redirect='';
server.listen(0,'127.0.0.1',()=>{
 redirect=`http://127.0.0.1:${server.address().port}/callback`;
 const auth='https://accounts.google.com/o/oauth2/v2/auth?'+new URLSearchParams({client_id:clientId,redirect_uri:redirect,response_type:'code',scope:'https://www.googleapis.com/auth/drive.file',access_type:'offline',prompt:'consent',state});
 console.log('브라우저에서 아래 주소를 열어 허용해 주세요(자동으로 열리지 않으면 복사해서 여세요):\n'+auth);
 exec((process.platform==='win32'?'start "" ':process.platform==='darwin'?'open ':'xdg-open ')+JSON.stringify(auth));
});
