export type Role = 'student' | 'teacher' | 'admin';
export type Membership = 'approved' | 'pending' | 'none';

export type User = {
  id?: string;
  name: string;
  email: string;
  role: Role;
  membership: Membership;
  avatar_url?: string;
};

export type AdminUser = User & { id: string };

export type Course = {
  id: number;
  title: string;
  category: string;
  description: string;
  instructor: string;
  instructorRole: string;
  image: string;
  free: boolean;
  new: boolean;
  duration: string;
  level: string;
  rating: number;
  students: number;
  lessons: number;
  completedStudents?: number;
  published?: boolean;
  completed?: number;
  owner_id?: string | null;
  owner_name?: string;
  owner_avatar?: string;
  top?: boolean;
  topRank?: number | null;
  created_by_name?: string;
};

export type LearningPath = {
  id: number;
  title: string;
  description: string;
  level: string;
  duration: string;
  icon: string;
  color: string;
  accent: string;
  published?: boolean;
  courseIds: number[];
  courses: Course[];
};

export type Lesson = {
  id: number;
  course_id: number;
  title: string;
  content: string;
  video_url: string;
  resource_url: string;
  position: number;
  published: number | boolean;
  lesson_type?: 'content' | 'form';
  evaluation_mode?: 'informative' | 'graded';
  form_schema?: string;
  completed?: number;
  note?: string;
  score?: number | null;
  teacher_note?: string;
};

export type LiveEvent = {
  id: number;
  title: string;
  instructor: string;
  category: string;
  starts_at: string;
  capacity: number;
  meeting_url: string;
  published: number | boolean;
  attendees?: number;
  reserved?: boolean;
};

export type Comment = {
  id: number;
  body: string;
  name: string;
  owner: boolean;
  created_at: string;
};

export type Submission = {
  id: string;
  file_url: string;
  file_name: string;
  note: string;
  status: string;
  feedback: string;
  submitted_at: string;
  reviewed_at?: string;
};

export type Instructor = {
  name: string;
  role: string;
  courses: number;
  students: number;
  avatar: string;
  specialty: string;
};

export type Certificate = {
  id: string;
  title: string;
  issued_at: string;
  course_id: number;
};

type ApiError = { error?: string };

export async function api<T>(path: string, method = 'GET', data?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch('/api' + path, {
      method,
      credentials: 'same-origin',
      headers: data === undefined ? {} : { 'Content-Type': 'application/json' },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
  } catch {
    throw new Error('No hay conexión con la academia. Inténtalo de nuevo.');
  }

  const raw = await response.text();
  let result: T & ApiError;
  try {
    result = raw ? (JSON.parse(raw) as T & ApiError) : ({} as T & ApiError);
  } catch {
    throw new Error('El servidor no respondió correctamente. Reinicia la academia e inténtalo de nuevo.');
  }

  if (!response.ok) {
    if (response.status === 401 && path !== '/auth/login') {
      window.dispatchEvent(new Event('academy-session-expired'));
    }
    throw new Error(result.error || 'No se pudo completar la solicitud.');
  }
  return result;
}
