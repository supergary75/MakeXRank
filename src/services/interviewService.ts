import { getValidAccessToken } from './authService';
import type { Interview, InterviewAction, InterviewInput, Staff } from '../../shared/interviewWorkflow.mjs';
import type { InterviewTemplate } from '../../shared/interviewTemplates.mjs';

// Only the first-party backend implements this API. Never send interview data to the legacy Supabase endpoint.
const base = import.meta.env.VITE_INTERVIEW_API_URL?.trim() || '/api';
export interface InterviewNotice { id: string; interviewId: string; message: string; createdAt: string; readAt: string | null }
export interface InterviewContext { actor: Staff; staff: Staff[] }
async function request<T>(path: string, body?: unknown): Promise<T> {
  const token = await getValidAccessToken();
  if (!token) throw new Error('请先登录真实账号，或使用下方隔离的演示模式。');
  const res = await fetch(`${base.replace(/\/$/, '')}/interviews${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(12000),
  });
  if (!res.headers.get('content-type')?.includes('application/json')) throw new Error('面试后端尚未连接。页面已就绪，请先体验演示模式；真实操作需部署 API 并绑定账号。');
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || '面试服务暂不可用');
  return data;
}
export const interviewApi = {
  context: () => request<InterviewContext>('/context'),
  list: () => request<Interview[]>(''),
  notices: () => request<InterviewNotice[]>('/notifications'),
  templates: () => request<InterviewTemplate[]>('/templates'),
  updateTemplate: (id:string, input:{version:number;name:string;description:string;sections:string[]}) => request<InterviewTemplate>(`/templates/${id}`,input),
  markRead: (id: string) => request('/notifications/read', { id }),
  create: (input: InterviewInput) => request<Interview>('', input),
  act: (id: string, input: InterviewAction) => request<Interview>(`/${encodeURIComponent(id)}/actions`, input),
};
