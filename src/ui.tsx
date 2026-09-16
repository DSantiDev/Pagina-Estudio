import { useEffect, useState, type ReactNode } from 'react';
import { api } from './api';

export function useResource<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setData(null);

    api<T>(path)
      .then(value => {
        if (active) setData(value);
      })
      .catch(cause => {
        if (active) setError(cause instanceof Error ? cause.message : 'No se pudo cargar la información.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [path, version]);

  return { data, error, loading, reload: () => setVersion(value => value + 1), setData };
}

export function ResourceState({ loading, error, retry }: { loading: boolean; error: string; retry: () => void }) {
  if (loading) return <div className="academy-empty" role="status">Cargando tu academia…</div>;
  if (!error) return null;
  return (
    <div className="academy-empty" role="alert">
      <p>{error}</p>
      <button className="academy-secondary" onClick={retry}>Volver a intentar</button>
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="academy-empty"><h3>{title}</h3>{children}</div>;
}

export function PageTitle({ label, title, children }: { label: string; title: string; children?: ReactNode }) {
  return <div className="academy-page-title"><div><p className="home-eyebrow">{label}</p><h1>{title}</h1></div>{children}</div>;
}

export function Progress({ completed, total }: { completed: number; total: number }) {
  const percent = total ? Math.min(100, Math.round(completed / total * 100)) : 0;
  return <div className="academy-progress"><div><span>{completed} de {total} lecciones</span><strong>{percent}%</strong></div><progress value={percent} max={100} aria-label="Progreso del curso" /></div>;
}
