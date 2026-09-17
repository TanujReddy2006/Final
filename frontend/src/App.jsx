import React, { useEffect, useState } from 'react';
import { Link, NavLink, useParams, useLocation } from 'react-router-dom';
import {
  Award,
  BarChart3,
  BookOpen,
  Building2,
  CheckCircle2,
  ChevronRight,
  CircleUserRound,
  ClipboardCheck,
  Clock3,
  Compass,
  Download,
  FileCheck2,
  Home,
  LogOut,
  Menu,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
  X
} from 'lucide-react';
import { api, unwrap } from './services/api';
import { CompanyStudio, CoursePlayer, FinalAssessment } from './portalFeatures.jsx';
import { CompanyCourseBuilder } from './courseBuilder.jsx';
import { LearnerPlayer } from './learnerPlayer.jsx';
import {
  AdminCertificates,
  AdminUsers,
  CompanyLearners,
  CompanyOverview,
  HRHome,
  LearnerOverview,
  LearnerProfile
} from './rolePortals.jsx';

const demo = {
  learner: ['learner@example.com', 'Maya Chen', 'LEARNER'],
  company: ['company@example.com', 'Jordan Blake', 'COMPANY'],
  hr: ['hr@example.com', 'Avery Singh', 'HR'],
  admin: ['admin@example.com', 'Riley Admin', 'ADMIN']
};

function App() {
  const [user, setUser] = useState(() =>
    JSON.parse(localStorage.getItem('learnforge_user') || 'null')
  );
  const [menu, setMenu] = useState(false);

  const authenticate = async (endpoint, form) => {
    const data = await unwrap(api.post(endpoint, form));
    localStorage.setItem('learnforge_token', data.token);
    localStorage.setItem('learnforge_user', JSON.stringify(data.user));
    setUser(data.user);
  };

  const logout = () => {
    localStorage.clear();
    setUser(null);
  };

  const loc = useLocation();
  if (loc.pathname === '/verify' || loc.pathname.startsWith('/verify/')) return <Verify />;
  if (!user) return <Auth onAuthenticate={authenticate} />;

  return (
    <Shell user={user} logout={logout} menu={menu} setMenu={setMenu}>
      <Routes user={user} />
    </Shell>
  );
}

function Auth({ onAuthenticate }) {
  const [register, setRegister] = useState(false);
  const [form, setForm] = useState({
    email: 'learner@example.com',
    password: 'Demo@123',
    name: '',
    role: 'LEARNER',
    companyName: ''
  });
  const [error, setError] = useState('');

  const submit = async e => {
    e.preventDefault();
    try {
      await onAuthenticate(
        register ? '/auth/register' : '/auth/login',
        register ? form : { email: form.email, password: form.password }
      );
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to complete account action');
    }
  };

  return (
    <main className="auth">
      <section className="auth-art">
        <div className="brand">
          <span className="brand-mark">L</span> learnforge
        </div>
        <div className="art-copy">
          <p className="eyebrow">THE SKILLS OPERATING SYSTEM</p>
          <h1>
            Make progress
            <br />
            <em>visible.</em>
          </h1>
          <p>One focused home for learning, assessment, and credentials your team can trust.</p>
          <div className="quote">
            <Sparkles size={18} /> “The clearest path from potential to proof.”
          </div>
        </div>
        <div className="art-footer">
          Enterprise learning platform <span>2026</span>
        </div>
      </section>

      <section className="auth-form">
        <div className="form-inner">
          <div className="mobile-brand brand">
            <span className="brand-mark">L</span> learnforge
          </div>
          <p className="eyebrow">{register ? 'JOIN THE NETWORK' : 'WELCOME BACK'}</p>
          <h2>{register ? 'Start building your next skill.' : 'Your learning space awaits.'}</h2>
          <p className="muted">
            {register
              ? 'Create an account to access guided pathways and verified credentials.'
              : 'Sign in to pick up where you left off.'}
          </p>

          <form onSubmit={submit}>
            {register && (
              <Field
                label="Full name"
                value={form.name}
                onChange={v => setForm({ ...form, name: v })}
                placeholder="Maya Chen"
              />
            )}
            {register && (
              <label className="field">
                <span>Account type</span>
                <select
                  value={form.role}
                  onChange={e => setForm({ ...form, role: e.target.value })}
                >
                  <option value="LEARNER">Learner</option>
                  <option value="COMPANY">Company / provider</option>
                  <option value="HR">HR / employer</option>
                </select>
              </label>
            )}
            {register && form.role === 'COMPANY' && (
              <Field
                label="Company name"
                value={form.companyName}
                onChange={v => setForm({ ...form, companyName: v })}
                placeholder="Acme Learning"
              />
            )}
            <Field
              label="Email address"
              value={form.email}
              onChange={v => setForm({ ...form, email: v })}
              placeholder="you@company.com"
              type="email"
            />
            <Field
              label="Password"
              value={form.password}
              onChange={v => setForm({ ...form, password: v })}
              placeholder="••••••••"
              type="password"
            />

            {error && <div className="error">{error}</div>}

            <button className="button primary wide">
              {register ? 'Create account' : 'Sign in'} <ChevronRight size={17} />
            </button>
          </form>

          <div className="form-switch">
            {register ? 'Already have an account?' : 'New to learnforge?'}{' '}
            <button
              onClick={() => {
                setRegister(!register);
                setError('');
              }}
            >
              {register ? 'Sign in' : 'Create account'}
            </button>
          </div>

          <div className="demo-login">
            <span>Demo access</span>
            <div>
              {Object.entries(demo).map(([key, value]) => (
                <button
                  key={key}
                  onClick={() => {
                    setForm({ ...form, email: value[0], password: 'Demo@123' });
                    setError('');
                  }}
                >
                  {key}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function Field({ label, value, onChange, ...props }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input value={value} onChange={e => onChange(e.target.value)} {...props} />
    </label>
  );
}

function Shell({ user, logout, menu, setMenu, children }) {
  const nav =
    user.role === 'LEARNER'
      ? [
          ['/dashboard', 'Overview', Home],
          ['/courses', 'Explore courses', Compass],
          ['/my-courses', 'My learning', BookOpen],
          ['/certificates', 'Certificates', Award],
          ['/profile', 'My profile', CircleUserRound]
        ]
      : user.role === 'HR'
      ? [
          ['/hr/dashboard', 'Overview', Home],
          ['/hr/verify', 'Verify certificate', ShieldCheck]
        ]
      : user.role === 'ADMIN'
      ? [
          ['/admin/dashboard', 'Overview', BarChart3],
          ['/admin/users', 'People & roles', Users],
          ['/admin/certificates', 'Certificates', Award]
        ]
      : [
          ['/company/dashboard', 'Overview', Home],
          ['/company/courses', 'Course studio', BookOpen],
          ['/company/learners', 'Learners', Users]
        ];

  return (
    <div className="app-shell">
      <aside className={menu ? 'sidebar open' : 'sidebar'}>
        <div className="brand">
          <span className="brand-mark">L</span> learnforge
        </div>
        <div className="workspace">
          <span className="avatar">{user.name?.slice(0, 1)}</span>
          <div>
            <strong>{user.name}</strong>
            <small>{user.role === 'COMPANY' ? 'Training Provider' : user.role}</small>
          </div>
        </div>
        <nav>
          {nav.map(([to, label, Icon]) => (
            <NavLink
              onClick={() => setMenu(false)}
              className={({ isActive }) => (isActive ? 'active' : '')}
              key={to}
              to={to}
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="status-dot">
            <span /> Platform operational
          </div>
          <button className="logout" onClick={logout}>
            <LogOut size={17} /> Sign out
          </button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button className="icon-button mobile-menu" onClick={() => setMenu(!menu)}>
            {menu ? <X /> : <Menu />}
          </button>
          <div className="breadcrumb">
            Workspace <ChevronRight size={15} />{' '}
            <strong>
              {user.role === 'LEARNER' ? 'Learning hub' : `${user.role.toLowerCase()} portal`}
            </strong>
          </div>
          <div className="top-actions">
            <button className="icon-button">
              <Search size={18} />
            </button>
            <span className="notification">
              <span />
            </span>
            <span className="avatar small">{user.name?.slice(0, 1)}</span>
          </div>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}

function Routes({ user }) {
  const path = useLocation().pathname;

  if (path === '/courses') return <Courses />;
  if (path.startsWith('/courses/')) return <Course />;
  if (path === '/my-courses') return <MyCourses />;
  if (path.startsWith('/my-courses/')) return <LearnerPlayer />;
  if (path.startsWith('/assessments/')) return <FinalAssessment />;
  if (path === '/certificates') return <Certificates />;
  if (path === '/profile') return <LearnerProfile user={user} />;
  if (path === '/hr/verify') return <HRVerify />;
  if (path === '/hr/dashboard') return <HRHome />;
  if (path === '/company/courses') return <CompanyCourseBuilder />;
  if (path.startsWith('/company/courses/')) return <CompanyCourseBuilder />;
  if (path === '/company/learners') return <CompanyLearners />;
  if (path === '/company/dashboard') return <CompanyOverview />;
  if (path === '/admin/users') return <AdminUsers />;
  if (path === '/admin/certificates') return <AdminCertificates />;
  if (path.includes('/admin/')) return <AdminDashboard />;

  return <LearnerOverview user={user} />;
}

function Stat({ label, value, trend, icon: Icon }) {
  return (
    <div className="stat">
      <div className="stat-top">
        <span>{label}</span>
        <Icon size={19} />
      </div>
      <strong>{value}</strong>
      <small>{trend}</small>
    </div>
  );
}

function PageTitle({ eyebrow, title, sub, action }) {
  return (
    <div className="page-title">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="muted">{sub}</p>
      </div>
      {action}
    </div>
  );
}

function Courses() {
  const [courses, setCourses] = useState([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    unwrap(api.get(`/courses?search=${encodeURIComponent(search)}`)).then(setCourses);
  }, [search]);

  return (
    <>
      <PageTitle
        eyebrow="CATALOG"
        title="Find your next edge."
        sub="Published courses created by training providers."
      />
      <div className="catalog-tools">
        <div className="searchbox">
          <Search size={18} />
          <input
            placeholder="Search by skill, topic, or course"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="filter-pills">
          <button className="pill active">All courses</button>
        </div>
      </div>
      {courses.length ? (
        <div className="course-grid browse">
          {courses.map(c => (
            <CourseCard key={c.id} course={c} />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <BookOpen size={40} />
          <h2>No courses available yet.</h2>
          <p className="muted">Companies can publish courses here.</p>
        </div>
      )}
    </>
  );
}

function CourseCard({ course, progress }) {
  return (
    <Link
      className="course-card"
      to={progress !== undefined ? `/my-courses/${course.id}` : `/courses/${course.id}`}
    >
      <div className="course-cover" style={{ background: course.color || '#d5f6e6' }}>
        <span>{course.category}</span>
        <BookOpen size={34} />
      </div>
      <div className="course-card-body">
        <div className="card-meta">
          <span>{course.difficulty}</span>
          <span>{course.modules?.length || 0} modules</span>
        </div>
        <h3>{course.title}</h3>
        <p>{course.description}</p>
        <div className="course-footer">
          <span className="company-label">
            <span className="company-dot">
              {course.company?.name?.slice(0, 1) || 'P'}
            </span>{' '}
            {course.company?.name || 'Training provider'}
          </span>
          {progress !== undefined ? (
            <span className="mini-progress">{progress}%</span>
          ) : (
            <ChevronRight size={17} />
          )}
        </div>
        {progress !== undefined && (
          <div className="progress">
            <span style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>
    </Link>
  );
}

function Course() {
  const params = useParams();
  const loc = useLocation();
  const id = params.id || loc.pathname.split('/')[2];
  const [course, setCourse] = useState(null);
  const [enrolled, setEnrolled] = useState(false);

  useEffect(() => {
    if (!id) return;
    unwrap(api.get(`/courses/${id}`))
      .then(setCourse)
      .catch(() => setCourse({ error: true }));
  }, [id]);

  if (!id) {
    return (
      <div className="empty-state">
        <BookOpen size={40} />
        <h2>Course not found</h2>
        <p className="muted">This course link is missing a valid course ID.</p>
        <Link className="button dark" to="/courses">
          Back to catalog
        </Link>
      </div>
    );
  }

  if (!course) return <Loading />;
  if (course.error) {
    return (
      <div className="empty-state">
        <BookOpen size={40} />
        <h2>Course unavailable</h2>
        <p className="muted">This course could not be loaded right now.</p>
        <Link className="button dark" to="/courses">
          Back to catalog
        </Link>
      </div>
    );
  }

  const enroll = async () => {
    await unwrap(api.post('/enrollments', { courseId: id }));
    setEnrolled(true);
  };

  return (
    <>
      <Link className="back-link" to="/courses">
        ← Back to catalog
      </Link>
      <div className="course-hero">
        <div>
          <span className="tag">
            {course.category} · {course.difficulty}
          </span>
          <h1>{course.title}</h1>
          <p>{course.description}</p>
          <div className="hero-meta">
            <span>
              <Building2 size={16} />{' '}
              {course.company?.name || course.instructorName || 'Training provider'}
            </span>
            <span>
              <Clock3 size={16} /> {course.duration}
            </span>
            <span>
              <ClipboardCheck size={16} /> {course.modules.length} modules
            </span>
          </div>
        </div>
        <div className="course-hero-action">
          <Award size={38} />
          <strong>
            Certificate
            <br />
            pathway
          </strong>
          <button onClick={enroll} className="button primary">
            {enrolled ? 'Enrolled' : 'Enroll now'} <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div className="course-layout">
        <section>
          <div className="section-heading">
            <h3>What you’ll learn</h3>
          </div>
          <div className="objectives">
            {(course.learningObjectives?.length
              ? course.learningObjectives
              : ['Complete the lessons in this course', 'Pass the final assessment']
            ).map(objective => (
              <span key={objective}>{objective}</span>
            ))}
          </div>

          <div className="section-heading">
            <h3>
              Course modules <small>{course.modules.length} modules</small>
            </h3>
          </div>
          <div className="module-list">
            {course.modules.map((m, i) => (
              <div className="module-row" key={m.id}>
                <span className="module-number">0{i + 1}</span>
                <div>
                  <strong>{m.title}</strong>
                  <p>{m.content}</p>
                </div>
                <span className="muted">{m.duration}</span>
                <ChevronRight size={17} />
              </div>
            ))}
          </div>
        </section>

        <aside className="panel course-aside">
          <h3>Course requirements</h3>
          <p className="muted">{course.prerequisites || 'No prerequisites provided.'}</p>
          <hr />
          <h3>Instructor / provider</h3>
          <p className="muted">
            {course.instructorName || course.company?.name || 'Training provider'}
          </p>
        </aside>
      </div>
    </>
  );
}

function MyCourses() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    unwrap(api.get('/enrollments/me')).then(setItems);
  }, []);

  return (
    <>
      <PageTitle
        eyebrow="MY LEARNING"
        title="Your courses."
        sub="Keep your momentum. Every completed module counts."
      />
      <div className="course-grid">
        {items.map(e => (
          <CourseCard key={e.id} course={e.course} progress={e.progress} />
        ))}
      </div>
    </>
  );
}

function Certificates() {
  const [certs, setCerts] = useState([]);

  useEffect(() => {
    unwrap(api.get('/certificates/me')).then(setCerts);
  }, []);

  return (
    <>
      <PageTitle
        eyebrow="CREDENTIALS"
        title="Proof of your progress."
        sub="Verified credentials you can take anywhere."
      />
      <div className="certificate-grid">
        {certs.map(c => (
          <CertificateCard key={c.id} cert={c} />
        ))}
        {!certs.length && (
          <div className="empty-cert">
            <Award size={42} />
            <h3>Your first certificate is ahead.</h3>
            <p>Complete a learning pathway and final assessment to earn a verified credential.</p>
            <Link to="/courses" className="button dark">
              Explore courses
            </Link>
          </div>
        )}
      </div>
    </>
  );
}

function CertificateCard({ cert }) {
  return (
    <div className="certificate-card">
      <div className="certificate-top">
        <div className="cert-seal">
          <Award size={24} />
        </div>
        <span className="valid">
          <CheckCircle2 size={14} /> {cert.status}
        </span>
      </div>
      <p className="eyebrow">LEARNFORGE CERTIFIED</p>
      <h2>{cert.certification}</h2>
      <p className="muted">
        Awarded to <strong>{cert.learnerName}</strong> · Score {cert.score}%
      </p>
      <div className="cert-bottom">
        <span>{cert.certificateId}</span>
        <span>
          <a
            href={`${api.defaults.baseURL.replace('/api/v1', '')}${cert.pdfUrl}`}
            target="_blank"
            rel="noreferrer"
          >
            PDF
          </a>{' '}
          ·{' '}
          <Link to={`/verify/${cert.certificateId}`}>
            Verify <ChevronRight size={14} />
          </Link>
        </span>
      </div>
    </div>
  );
}

function extractCertificateIdFromLocation(pathname, paramId) {
  if (paramId && paramId !== 'certificate') {
    return paramId.trim();
  }
  const cleanPath = (pathname || '').trim().replace(/\/+$/, '');
  const segments = cleanPath.split('/').filter(Boolean);
  if (segments.length === 0) return '';
  const lastSegment = segments[segments.length - 1];
  if (lastSegment === 'verify' || lastSegment === 'certificate') {
    return '';
  }
  return decodeURIComponent(lastSegment);
}

function sanitizeCertificateQuery(input) {
  if (!input) return '';
  let str = String(input).trim();
  if (str.startsWith('http://') || str.startsWith('https://')) {
    try {
      const parsedUrl = new URL(str);
      const parts = parsedUrl.pathname.replace(/\/+$/, '').split('/').filter(Boolean);
      str = parts.length > 0 ? parts[parts.length - 1] : str;
    } catch {
      const match = str.match(/([A-Za-z0-9_-]+)$/);
      if (match) str = match[1];
    }
  } else if (str.includes('/')) {
    const parts = str.replace(/\/+$/, '').split('/').filter(Boolean);
    str = parts.length > 0 ? parts[parts.length - 1] : str;
  }
  return str.trim();
}

function Verify() {
  const params = useParams();
  const loc = useLocation();
  const certificateId = extractCertificateIdFromLocation(loc.pathname, params.certificateId);
  const [manualId, setManualId] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!certificateId) {
      setResult(null);
      return;
    }
    setLoading(true);
    unwrap(api.get(`/verify/${encodeURIComponent(certificateId)}`))
      .then(setResult)
      .catch(err => {
        setResult({
          status: 'NOT FOUND',
          message: err.response?.data?.message || 'Certificate not found'
        });
      })
      .finally(() => setLoading(false));
  }, [certificateId]);

  const handleManualSearch = e => {
    e.preventDefault();
    const clean = sanitizeCertificateQuery(manualId);
    if (!clean) return;
    window.location.href = `/verify/${encodeURIComponent(clean)}`;
  };

  return (
    <main className="verify-page">
      <div className="verify-brand brand">
        <span className="brand-mark">L</span> learnforge
      </div>
      <div className="verify-box">
        {loading ? (
          <Loading />
        ) : !certificateId && !result ? (
          <>
            <div className="verify-icon">
              <ShieldCheck size={32} />
            </div>
            <p className="eyebrow">OFFICIAL VERIFICATION REGISTRY</p>
            <h1>Verify a LearnForge Credential</h1>
            <p className="muted">
              Enter any Certificate ID or Certificate Number to verify authentic credential status directly on our registry.
            </p>
            <form onSubmit={handleManualSearch} style={{ display: 'flex', gap: '8px', marginTop: '24px' }}>
              <input
                className="field input"
                style={{
                  width: '100%',
                  height: '46px',
                  border: '1px solid var(--line)',
                  borderRadius: '7px',
                  padding: '0 14px'
                }}
                value={manualId}
                onChange={e => setManualId(e.target.value)}
                placeholder="e.g. CERT-2026-XXXX or verification URL"
              />
              <button className="button dark" type="submit">
                Verify
              </button>
            </form>
            <div style={{ marginTop: '24px' }}>
              <Link to="/" className="text-link" style={{ justifyContent: 'center' }}>
                Return to learnforge
              </Link>
            </div>
          </>
        ) : result?.status === 'NOT FOUND' ? (
          <>
            <div className="verify-icon invalid">×</div>
            <p className="eyebrow">CERTIFICATE NOT FOUND</p>
            <h1>We couldn’t verify this credential.</h1>
            <p className="muted">
              {result.message || 'The specified certificate identifier could not be matched with any issued credential in our registry.'}
            </p>
            <div style={{ marginTop: '24px', display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <Link to="/verify" className="button dark">
                Try another ID
              </Link>
              <Link to="/" className="button primary">
                Return to learnforge
              </Link>
            </div>
          </>
        ) : result ? (
          <>
            <div className={`verify-icon ${result.status === 'VALID' ? '' : 'invalid'}`}>
              {result.status === 'VALID' ? <CheckCircle2 size={32} /> : '!'}
            </div>
            <p className="eyebrow">
              {result.status === 'VALID' ? 'AUTHENTIC CREDENTIAL' : 'CREDENTIAL STATUS'}
            </p>
            <h1>
              {result.status === 'VALID'
                ? 'Certificate verified.'
                : `Certificate ${result.status.toLowerCase()}.`}
            </h1>
            <p className="muted">
              This credential was issued by LearnForge and its status is recorded on our
              tamper-resistant verification registry.
            </p>
            <div className="verify-details">
              <div>
                <small>Certificate</small>
                <strong>{result.certification || result.courseName}</strong>
              </div>
              <div>
                <small>Issued to</small>
                <strong>{result.learnerName}</strong>
              </div>
              <div>
                <small>Issued by</small>
                <strong>{result.issuedBy}</strong>
              </div>
              <div>
                <small>Certificate ID</small>
                <strong>{result.certificateId}</strong>
              </div>
              {result.certificateNumber && (
                <div>
                  <small>Certificate Number</small>
                  <strong>{result.certificateNumber}</strong>
                </div>
              )}
              <div>
                <small>Highest Score</small>
                <strong>{result.score}%</strong>
              </div>
              <div>
                <small>Issued Date</small>
                <strong>{new Date(result.issuedDate).toLocaleDateString()}</strong>
              </div>
              <div>
                <small>Skills</small>
                <strong>{result.skills?.join(' · ') || 'Verified Competencies'}</strong>
              </div>
            </div>

            {result.pdfUrl && (
              <div style={{ marginBottom: '20px' }}>
                <a
                  href={`${api.defaults.baseURL.replace('/api/v1', '')}${result.pdfUrl}`}
                  className="button dark"
                  target="_blank"
                  rel="noreferrer"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
                >
                  <Download size={15} /> Download Certificate PDF
                </a>
              </div>
            )}

            <span className="verified-note">
              <ShieldCheck size={16} /> Verified by learnforge registry
            </span>
          </>
        ) : (
          <Loading />
        )}
      </div>
    </main>
  );
}

function HRVerify() {
  const [id, setId] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async e => {
    e.preventDefault();
    const cleanId = sanitizeCertificateQuery(id);
    if (!cleanId) {
      setError('Please enter a certificate ID, certificate number, or verification URL');
      setResult(null);
      return;
    }
    setError('');
    setLoading(true);
    try {
      const data = await unwrap(api.get(`/verify/${encodeURIComponent(cleanId)}`));
      setResult(data);
    } catch (err) {
      setResult({
        status: 'NOT FOUND',
        message: err.response?.data?.message || 'Certificate not found in registry'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <PageTitle
        eyebrow="HR PORTAL"
        title="Verify a credential."
        sub="A quick, privacy-conscious check for the candidates and employees you’re hiring."
      />
      <div className="hr-layout">
        <section className="panel verify-form">
          <ShieldCheck size={30} />
          <h2>Certificate lookup</h2>
          <p className="muted">
            Enter the certificate ID, certificate number, or paste the verification link from the candidate's PDF.
          </p>
          <form onSubmit={submit}>
            <input
              value={id}
              onChange={e => {
                setId(e.target.value);
                if (error) setError('');
              }}
              placeholder="e.g. CERT-2026-XXXXXX or paste verification URL"
            />
            <button className="button dark" type="submit" disabled={loading}>
              {loading ? 'Verifying...' : 'Verify certificate'} <Search size={16} />
            </button>
          </form>
          {error && <div className="error">{error}</div>}
        </section>

        {result && (
          <section className="panel result">
            <div className={`verify-icon mini ${result.status === 'VALID' ? '' : 'invalid'}`}>
              {result.status === 'VALID' ? <CheckCircle2 /> : '!'}
            </div>
            <span className="eyebrow">{result.status}</span>
            <h2>{result.certification || result.courseName || 'No record found'}</h2>
            {result.status === 'VALID' ? (
              <div style={{ width: '100%', marginTop: '12px' }}>
                <p style={{ margin: '4px 0' }}>
                  Issued to: <strong>{result.learnerName}</strong>
                </p>
                <p className="muted" style={{ margin: '4px 0' }}>
                  Course: <strong>{result.courseName}</strong>
                </p>
                <p className="muted" style={{ margin: '4px 0' }}>
                  Issued by: <strong>{result.issuedBy}</strong> · Passing Score: <strong>{result.score}%</strong>
                </p>
                <p className="muted" style={{ margin: '4px 0' }}>
                  Issued Date: {new Date(result.issuedDate).toLocaleDateString()}
                  {result.expiryDate ? ` · Expires: ${new Date(result.expiryDate).toLocaleDateString()}` : ''}
                </p>
                <p className="muted" style={{ margin: '4px 0' }}>
                  Certificate ID: <code style={{ background: '#f0f3f1', padding: '2px 6px', borderRadius: '4px' }}>{result.certificateId}</code>
                  {result.certificateNumber && ` (${result.certificateNumber})`}
                </p>
                <div style={{ display: 'flex', gap: '10px', marginTop: '18px' }}>
                  {result.pdfUrl && (
                    <a
                      href={`${api.defaults.baseURL.replace('/api/v1', '')}${result.pdfUrl}`}
                      className="button dark"
                      style={{ height: '36px', fontSize: '12px' }}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Download size={14} /> Download PDF
                    </a>
                  )}
                  <Link
                    to={`/verify/${result.certificateId}`}
                    className="button primary"
                    style={{ height: '36px', fontSize: '12px' }}
                    target="_blank"
                  >
                    Public Registry View
                  </Link>
                </div>
              </div>
            ) : (
              <p className="muted" style={{ marginTop: '10px' }}>
                {result.message || 'No active credential matches this identifier in the LearnForge registry.'}
              </p>
            )}
          </section>
        )}
      </div>
    </>
  );
}

function AdminDashboard() {
  const [data, setData] = useState(null);

  useEffect(() => {
    unwrap(api.get('/admin/overview')).then(setData);
  }, []);

  return (
    <>
      <PageTitle
        eyebrow="SYSTEM ADMINISTRATION"
        title="Platform overview."
        sub="The health of your learning ecosystem at a glance."
      />
      <div className="stats-grid">
        <Stat label="Learners" value={data?.learners || 0} trend="Registered users" icon={Users} />
        <Stat
          label="Companies"
          value={data?.companies || 0}
          trend="Training providers"
          icon={Building2}
        />
        <Stat label="Courses" value={data?.courses || 0} trend="Across catalog" icon={BookOpen} />
        <Stat
          label="Certificates"
          value={data?.certificates || 0}
          trend="Issued credentials"
          icon={Award}
        />
      </div>

      <div className="panel table-panel">
        <div className="panel-heading">
          <h3>Recent audit activity</h3>
          <span className="status-badge">LIVE</span>
        </div>
        {(data?.auditLogs || []).slice(0, 6).map(log => (
          <div className="table-row" key={log.id}>
            <span className="activity-icon tone-0">
              <CheckCircle2 size={15} />
            </span>
            <strong>{log.action.replaceAll('_', ' ')}</strong>
            <span className="muted">{new Date(log.timestamp).toLocaleString()}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function Loading() {
  return <div className="loading">Loading workspace...</div>;
}


function Empty() {
  return (
    <div className="empty-state">
      <BookOpen size={34} />
      <h3>No courses yet</h3>
      <p className="muted">Explore the catalog to start learning.</p>
    </div>
  );
}

export default App;
