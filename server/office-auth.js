/** Adapter contract: the office backend validates its existing credentials.
 * Do not point this at an HTML login page. Configure its documented authentication API.
 * The trusted response must be { authenticated: true, active: true, user: { id, name, username } }.
 * Adapt ONLY this file when the office provider supplies a different API contract.
 */
export async function authenticateOffice({ username, password }) {
  const endpoint = process.env.COOVITEL_AUTH_URL;
  if (!endpoint) throw Object.assign(new Error('El acceso de la oficina virtual aún no está conectado. Administración debe configurar la integración.'), { status: 503 });
  let url;
  try { url = new URL(endpoint); } catch { throw Object.assign(new Error('La integración de acceso no está configurada correctamente.'), { status: 503 }); }
  if (url.protocol !== 'https:') throw Object.assign(new Error('La integración de acceso requiere HTTPS.'), { status: 503 });
  let response;
  try {
    response = await fetch(url, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(12000), headers: { 'Content-Type': 'application/json', ...(process.env.COOVITEL_AUTH_TOKEN ? { Authorization: `Bearer ${process.env.COOVITEL_AUTH_TOKEN}` } : {}) }, body: JSON.stringify({ username, password }) });
  } catch { throw Object.assign(new Error('La oficina virtual no está disponible. Inténtalo de nuevo más tarde.'), { status: 503 }); }
  if ([401,403].includes(response.status)) throw Object.assign(new Error('Usuario o contraseña incorrectos, o cuenta sin acceso.'), { status: 401 });
  if (!response.ok) throw Object.assign(new Error('La oficina virtual no pudo validar el acceso.'), { status: 503 });
  let data; try { data = await response.json(); } catch { throw Object.assign(new Error('La respuesta de la oficina virtual no es válida.'), { status: 503 }); }
  if (data.authenticated !== true || data.active !== true || !data.user || !['string','number'].includes(typeof data.user.id) || !String(data.user.id).trim() || typeof data.user.name !== 'string') throw Object.assign(new Error('La oficina virtual no confirmó un acceso válido.'), { status: 401 });
  return { id: String(data.user.id).slice(0,200), name: data.user.name.slice(0,100), email: String(data.user.username || username).slice(0,254) };
}
