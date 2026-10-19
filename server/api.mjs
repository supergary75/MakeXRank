import express from 'express';
import {mountAuth} from './auth.mjs';
import {mountRest} from './rest.mjs';
export async function createCoreApi(pool,jwtSecret,options) {
  const app=express();app.disable('x-powered-by');
  // The loopback Nginx proxy must overwrite forwarded client addresses.
  app.set('trust proxy','loopback');
  app.use('/auth',express.json({limit:'4kb'}));
  app.use('/functions',express.json({limit:'32kb'}));
  app.use(express.json({limit:'30mb'}));
  const authentication=await mountAuth(app,pool,jwtSecret,options);mountRest(app,pool,authentication);
  app.get('/health',async(_req,res,next)=>{try{await pool.query('select 1');res.json({ok:true});}catch(e){next(e);}});
  return {app,requireAuth:authentication.requireAuth};
}
export function apiError(error,_req,res,_next) {
  const status=error.status||500;if(status===429)res.set('Retry-After','900');
  if(status>=500)console.error('MakeXRank API error',error.code||error.name);
  res.status(status).json({message:status>=500?'Server error':error.message});
}
