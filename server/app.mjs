import pg from 'pg';
import {createCoreApi,apiError} from './api.mjs';
import {mountInterviewRoutes} from './interviews.mjs';
import {mountCurriculumRoutes} from './curriculum.mjs';
import {mountAcademicRoutes} from './academic.mjs';

const databaseUrl=process.env.DATABASE_URL,jwtSecret=process.env.JWT_SECRET;
if(!databaseUrl||!jwtSecret)throw new Error('DATABASE_URL and JWT_SECRET are required');
const pool=new pg.Pool({connectionString:databaseUrl,max:10});
await pool.query('create table if not exists competition_deletions (id text primary key,deleted_at timestamptz not null default now())');
const {app,requireAuth}=await createCoreApi(pool,jwtSecret);
await mountInterviewRoutes(app,pool,requireAuth);
await mountCurriculumRoutes(app,pool,requireAuth);
await mountAcademicRoutes(app,pool,requireAuth);
app.use(apiError);
const port=Number(process.env.PORT||3000);
app.listen(port,'127.0.0.1',()=>console.log(`MakeXRank API listening on ${port}`));
