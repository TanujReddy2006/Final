import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api, unwrap } from './services/api';
import {
  Award,
  BookOpen,
  Building2,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  FileCheck2,
  Layers,
  Menu,
  Network,
  Sparkles,
  Users,
  X
} from 'lucide-react';
import './landing.css';

export function LandingPage({ user }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [featuredCourse, setFeaturedCourse] = useState(null);

  useEffect(() => {
    unwrap(api.get('/courses'))
      .then(courses => {
        if (courses && courses.length > 0) {
          setFeaturedCourse(courses[0]);
        }
      })
      .catch(() => {});
  }, []);

  const handleNavClick = (e, targetId) => {
    if (targetId.startsWith('#')) {
      e.preventDefault();
      const el = document.getElementById(targetId.substring(1));
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
      }
      setMobileMenuOpen(false);
    }
  };

  return (
    <div className="landing-page">
      {/* 1. Header */}
      <header className="landing-header">
        <div className="landing-header-inner">
          <Link to="/" className="landing-brand">
            <span className="brand-mark">L</span>
            <span className="brand-name">learnforge</span>
            <span className="landing-brand-badge">ONEST Network</span>
          </Link>

          <nav className="landing-nav">
            <a href="#about" onClick={e => handleNavClick(e, '#about')}>
              About
            </a>
            <a href="#use-cases" onClick={e => handleNavClick(e, '#use-cases')}>
              Use Cases
            </a>
            <a href="#how-it-works" onClick={e => handleNavClick(e, '#how-it-works')}>
              How It Works
            </a>
          </nav>

          <div className="landing-actions">
            {user ? (
              <Link to="/dashboard" className="button primary">
                Open Dashboard <ChevronRight size={15} />
              </Link>
            ) : (
              <>
                <Link to="/signin" className="landing-btn-ghost">
                  Sign In
                </Link>
                <Link to="/register" className="button primary">
                  Register
                </Link>
              </>
            )}

            <button
              type="button"
              className="landing-mobile-toggle"
              aria-label="Toggle navigation menu"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="landing-mobile-nav">
          <a href="#about" onClick={e => handleNavClick(e, '#about')}>
            About
          </a>
          <a href="#use-cases" onClick={e => handleNavClick(e, '#use-cases')}>
            Use Cases
          </a>
          <a href="#how-it-works" onClick={e => handleNavClick(e, '#how-it-works')}>
            How It Works
          </a>
          <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
            {user ? (
              <Link to="/dashboard" className="button primary wide" onClick={() => setMobileMenuOpen(false)}>
                Open Dashboard
              </Link>
            ) : (
              <>
                <Link to="/signin" className="button dark" style={{ flex: 1 }} onClick={() => setMobileMenuOpen(false)}>
                  Sign In
                </Link>
                <Link to="/register" className="button primary" style={{ flex: 1 }} onClick={() => setMobileMenuOpen(false)}>
                  Register
                </Link>
              </>
            )}
          </div>
        </div>
      )}

      {/* 2. Hero Section */}
      <section className="landing-hero">
        <div className="hero-content">
          <div className="hero-eyebrow">
            <Sparkles size={13} />
            <span>ONEST-Powered Corporate Certification</span>
          </div>

          <h1 className="hero-title">
            Certifications that are built to be <em>trusted, verified,</em> and recognized.
          </h1>

          <p className="hero-subtitle">
            An enterprise certification platform for corporate learning programs, enabling standardized skill validation,
            automated certification, and seamless verification across organizations.
          </p>

          <div className="hero-actions">
            {user ? (
              <Link to="/dashboard" className="button primary" style={{ height: '48px', padding: '0 24px', fontSize: '15px' }}>
                Go to Dashboard <ChevronRight size={17} />
              </Link>
            ) : (
              <>
                <Link to="/register" className="button primary" style={{ height: '48px', padding: '0 24px', fontSize: '15px' }}>
                  Get Started <ChevronRight size={17} />
                </Link>
                <Link to="/signin" className="button dark" style={{ height: '48px', padding: '0 22px', fontSize: '15px' }}>
                  Sign In
                </Link>
              </>
            )}
          </div>

          <div className="hero-meta">
            <div className="hero-meta-item">
              <CheckCircle2 size={16} />
              <span>ONEST & Beckn Protocol</span>
            </div>
            <div className="hero-meta-item">
              <CheckCircle2 size={16} />
              <span>NSQF Level 6 Mapped</span>
            </div>
            <div className="hero-meta-item">
              <CheckCircle2 size={16} />
              <span>Infosys Springboard Ready</span>
            </div>
            <div className="hero-meta-item">
              <CheckCircle2 size={16} />
              <span>Tamper-Resistant Digital Credentials</span>
            </div>
          </div>
        </div>

        {/* Hero Visual Card (Authentic Certificate Preview) */}
        <div className="hero-visual">
          <div className="hero-card">
            <div className="hero-card-header">
              <strong>
                <Award size={16} style={{ color: '#274d3d' }} />
                Verifiable Corporate Credential
              </strong>
              <span className="status-badge">ACTIVE</span>
            </div>

            <div className="hero-cert-preview">
              <div className="hero-cert-top">
                <div className="hero-cert-seal">
                  <Award size={20} />
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '9px', letterSpacing: '1px', textTransform: 'uppercase', color: '#88a89f' }}>
                    CERTIFICATE ID
                  </div>
                  <strong style={{ fontSize: '12px', letterSpacing: '0.5px' }}>INFY-2026-98421</strong>
                </div>
              </div>

              <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1.2px', color: '#97bbb0' }}>
                PROFESSIONAL CERTIFICATION
              </div>
              <h4>{featuredCourse?.title || 'Corporate Certification Program'}</h4>
              <p style={{ fontSize: '12px', color: '#bed2cb', margin: '4px 0 0' }}>
                {featuredCourse?.description || 'Industry-recognized verifiable credential issued upon completion.'}
              </p>

              <div className="hero-cert-meta">
                <div>
                  ISSUING ACADEMY
                  <strong>{featuredCourse?.company?.name || featuredCourse?.instructorName || 'Certified Enterprise Provider'}</strong>
                </div>
                <div>
                  CATEGORY
                  <strong>{featuredCourse?.category || 'Professional Skills'} &bull; {featuredCourse?.difficulty || 'Standard'}</strong>
                </div>
              </div>
            </div>

            <div className="hero-card-footer">
              <span className="verified-pill">
                <CheckCircle2 size={14} /> Authenticity Confirmed
              </span>
              <span style={{ color: 'var(--muted)' }}>
                Credential Status: <strong style={{ color: 'var(--ink)' }}>Valid</strong>
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Project / Use Case Section */}
      <section className="landing-section alt-bg" id="use-cases">
        <div className="landing-section-inner">
          <div className="landing-section-header">
            <div className="eyebrow">PROJECT USE CASE</div>
            <h2>Built for the future of corporate certification</h2>
            <p>
              Corporate training providers can use LearnForge to govern the complete corporate skilling journey &mdash;
              from structured modular learning and attempt-bounded assessments to standardized digital issuance and
              enterprise recognition.
            </p>
          </div>

          <div className="workflow-grid" id="how-it-works">
            <div className="workflow-card">
              <div className="workflow-step-num">01 &mdash; LEARN</div>
              <div className="workflow-icon-wrap">
                <BookOpen size={20} />
              </div>
              <h3>Learn</h3>
              <p>Employees enroll in corporate courses and track their learning progress in real time across lessons.</p>
            </div>

            <div className="workflow-card">
              <div className="workflow-step-num">02 &mdash; ASSESS</div>
              <div className="workflow-icon-wrap">
                <ClipboardCheck size={20} />
              </div>
              <h3>Assess</h3>
              <p>Assessments evaluate whether the learner has achieved the required skills under strict passing criteria.</p>
            </div>

            <div className="workflow-card">
              <div className="workflow-step-num">03 &mdash; VALIDATE</div>
              <div className="workflow-icon-wrap">
                <FileCheck2 size={20} />
              </div>
              <h3>Validate</h3>
              <p>Skills and assessment results are validated against defined qualification and competency frameworks.</p>
            </div>

            <div className="workflow-card">
              <div className="workflow-step-num">04 &mdash; CERTIFY</div>
              <div className="workflow-icon-wrap">
                <Award size={20} />
              </div>
              <h3>Certify</h3>
              <p>A standardized, tamper-evident digital certificate with unique identifier is issued to the learner.</p>
            </div>

            <div className="workflow-card">
              <div className="workflow-step-num">05 &mdash; RECOGNIZE</div>
              <div className="workflow-icon-wrap">
                <Building2 size={20} />
              </div>
              <h3>Recognize</h3>
              <p>HR teams and hiring platforms seamlessly acknowledge and respect certified credentials.</p>
            </div>
          </div>
        </div>
      </section>

      {/* 4. Why This Platform (Feature Cards) */}
      <section className="landing-section">
        <div className="landing-section-header">
          <div className="eyebrow">CORE CAPABILITIES</div>
          <h2>Why organizations choose LearnForge</h2>
          <p>
            Designed specifically to address the lack of standardization and friction across traditional corporate training programs.
          </p>
        </div>

        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon">
              <Award size={22} />
            </div>
            <h3>Standardized Certifications</h3>
            <p>
              Issue structured and consistent certifications across corporate learning programs aligned with national and global qualification standards.
            </p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">
              <Sparkles size={22} />
            </div>
            <h3>Automated Certification</h3>
            <p>
              Automatically issue certifications when learners satisfy assessment thresholds and module completion requirements without manual delay.
            </p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">
              <Building2 size={22} />
            </div>
            <h3>Enterprise Integration</h3>
            <p>
              Enable enterprise hiring platforms, recruiting workflows, and partner organizations to connect with validated candidate credentials.
            </p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">
              <Layers size={22} />
            </div>
            <h3>LMS Integration</h3>
            <p>
              Connect existing corporate learning platforms &mdash; including Infosys Springboard &mdash; through a dedicated, protocol-driven LMS adapter layer.
            </p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">
              <ClipboardCheck size={22} />
            </div>
            <h3>Skill Validation</h3>
            <p>
              Connect certifications with clearly defined skills and competency requirements, giving hiring teams transparent proof of capability.
            </p>
          </div>
        </div>
      </section>

      {/* 5. Interoperability Section */}
      <section className="landing-section" id="about">
        <div className="onest-container">
          <div className="onest-copy">
            <div className="eyebrow" style={{ color: '#275240' }}>
              INTEROPERABLE SKILL NETWORK
            </div>
            <h2>Designed for interoperable learning and certification</h2>
            <p>
              ONEST provides the interoperability layer that can help learning and skill credentials move across participating systems.
              This platform demonstrates how corporate learning outcomes can be connected to standardized certification and credential workflows.
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <Link to="/register" className="button dark" style={{ height: '42px', fontSize: '13px' }}>
                Get Started <ChevronRight size={15} />
              </Link>
            </div>
          </div>

          <div className="onest-points">
            <div className="onest-point">
              <Network size={20} />
              <div>
                <strong>Beckn Protocol Architecture</strong>
                <p>Standardized discovery, taxonomy descriptors, and fulfillments across heterogeneous enterprise ecosystems.</p>
              </div>
            </div>

            <div className="onest-point">
              <FileCheck2 size={20} />
              <div>
                <strong>W3C-Compatible Credentials</strong>
                <p>Portable, tamper-resistant certificates owned by the learner rather than locked inside isolated vendor portals.</p>
              </div>
            </div>

            <div className="onest-point">
              <Building2 size={20} />
              <div>
                <strong>Cross-Industry Recognition</strong>
                <p>Enables certified talent to be seamlessly recognized by employers and HR platforms without repetitive manual audits.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 6. Final Banner CTA */}
      <section className="landing-section" style={{ paddingTop: 0 }}>
        <div className="final-cta-banner">
          <div className="eyebrow" style={{ color: '#97d6bc' }}>
            ENTERPRISE SKILLING INFRASTRUCTURE
          </div>
          <h2>Ready to transform corporate certification?</h2>
          <p>
            Create, validate, issue, and manage industry-ready credentials through one platform.
          </p>

          <div className="final-cta-actions">
            {user ? (
              <Link to="/dashboard" className="button primary" style={{ height: '46px', padding: '0 24px' }}>
                Open Dashboard <ChevronRight size={16} />
              </Link>
            ) : (
              <>
                <Link to="/register" className="button primary" style={{ height: '46px', padding: '0 24px' }}>
                  Get Started <ChevronRight size={16} />
                </Link>
                <Link
                  to="/signin"
                  className="button"
                  style={{
                    height: '46px',
                    padding: '0 24px',
                    color: '#fff',
                    border: '1px solid rgba(255, 255, 255, 0.25)',
                    background: 'rgba(255, 255, 255, 0.08)'
                  }}
                >
                  Sign In
                </Link>
              </>
            )}
          </div>
        </div>
      </section>

      {/* 7. Footer */}
      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <div className="footer-brand">
            <Link to="/" className="landing-brand">
              <span className="brand-mark">L</span>
              <span className="brand-name">learnforge</span>
            </Link>
            <p>
              An enterprise corporate certification platform built on the ONEST open network standard for corporate learning providers.
            </p>
          </div>

          <div className="footer-links-grid">
            <div className="footer-column">
              <h4>Platform</h4>
              <ul>
                <li>
                  <Link to="/signin">Sign In</Link>
                </li>
                <li>
                  <Link to="/register">Register</Link>
                </li>
                {user && (
                  <li>
                    <Link to="/dashboard">My Dashboard</Link>
                  </li>
                )}
              </ul>
            </div>

            <div className="footer-column">
              <h4>Standard</h4>
              <ul>
                <li>
                  <a href="#about" onClick={e => handleNavClick(e, '#about')}>
                    ONEST Integration
                  </a>
                </li>
                <li>
                  <a href="#use-cases" onClick={e => handleNavClick(e, '#use-cases')}>
                    Corporate Workflow
                  </a>
                </li>
                <li>
                  <a href="#how-it-works" onClick={e => handleNavClick(e, '#how-it-works')}>
                    5-Step Lifecycle
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div className="footer-bottom">
          <span>&copy; 2026 learnforge. Built on the ONEST open network standard.</span>
          <span>Designed for corporate certification programs &bull; Infosys Springboard Adapter</span>
        </div>
      </footer>
    </div>
  );
}
export default LandingPage;
