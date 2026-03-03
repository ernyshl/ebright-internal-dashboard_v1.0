import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './LandingPage.css';

const features = [
    {
        icon: '📊',
        title: 'Marketing Analytics',
        desc: 'Track spend, leads, and conversions across Facebook, TikTok, Google Ads, Sara & Online channels in real time.',
        accent: 'brand',
    },
    {
        icon: '🎯',
        title: 'Leads Tracking',
        desc: 'Regional and branch-level lead generation analysis with powerful filtering and sorting.',
        accent: 'info',
    },
    {
        icon: '🔐',
        title: 'Role-Based Access',
        desc: 'Granular permission system — super admin, CEO, marketing, OD, RM, HR roles all supported.',
        accent: 'success',
    },
    {
        icon: '📈',
        title: 'Campaign Insights',
        desc: 'Drill down into the top 10 campaigns per channel ranked by spend with full cost-per-lead metrics.',
        accent: 'warning',
    },
    {
        icon: '🔄',
        title: 'Live Auto-Refresh',
        desc: 'Data updates automatically every 3 minutes so your team always works with the freshest numbers.',
        accent: 'brand',
    },
    {
        icon: '🌙',
        title: 'Dark Mode Ready',
        desc: 'A polished glassmorphism UI that looks stunning in both light and dark mode out of the box.',
        accent: 'info',
    },
];

const stats = [
    { value: '5', label: 'Marketing Channels' },
    { value: '10+', label: 'Campaign Views' },
    { value: '3 min', label: 'Auto-Refresh Cycle' },
    { value: '100%', label: 'Role-Secured' },
];

const carouselSlides = [
    {
        id: 'digital_marketing',
        title: 'Unified Marketing Analytics',
        benefit: 'Track spend, leads, and conversion funnels across Facebook, TikTok, Google Ads, Sara, and Online in one comprehensive dashboard.',
        image: '/digital_marketing.jpg',
        position: 'center',
        accent: '#1877F2'
    },
    {
        id: 'hr',
        title: 'Human Resources',
        benefit: 'Empowering your greatest asset. Complete employee lifecycle management from recruitment to retention with data-driven insights.',
        image: '/hr_department.jpg',
        position: 'center',
        accent: '#8b5cf6'
    },
    {
        id: 'events',
        title: 'Event Planning',
        benefit: 'Seamless coordination, unforgettable moments. Track attendance, logistics, and feedback for every internal and external event.',
        image: '/events_planning.jpg',
        position: 'center',
        accent: '#f97316'
    }
];

function LandingCarousel() {
    const [activeIndex, setActiveIndex] = React.useState(0);

    React.useEffect(() => {
        const timer = setInterval(() => {
            setActiveIndex((prev) => (prev + 1) % carouselSlides.length);
        }, 6000);
        return () => clearInterval(timer);
    }, []);

    const slide = carouselSlides[activeIndex];

    return (
        <div className="lp-carousel">
            <div className="lp-carousel-inner">
                <div className="lp-mockup-topbar">
                    <div className="lp-mockup-dot" style={{ background: '#ef4444' }} />
                    <div className="lp-mockup-dot" style={{ background: '#f59e0b' }} />
                    <div className="lp-mockup-dot" style={{ background: '#10b981' }} />
                    <span className="lp-mockup-title">{slide.title} Integration</span>
                </div>

                <div className="lp-carousel-slide-content">
                    <div className="lp-slide-visual">
                        <img
                            src={slide.image}
                            alt={slide.title}
                            className="lp-slide-img"
                            style={{ objectPosition: slide.position || 'center' }}
                        />
                        <div className="lp-slide-overlay">
                            <h3 className="lp-slide-title" style={{ color: slide.accent }}>
                                {slide.title}
                            </h3>
                            <p className="lp-slide-benefit">{slide.benefit}</p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="lp-carousel-nav">
                {carouselSlides.map((s, i) => (
                    <button
                        key={s.id}
                        className={`lp-carousel-dot ${i === activeIndex ? 'active' : ''}`}
                        onClick={() => setActiveIndex(i)}
                    />
                ))}
            </div>
        </div>
    );
}

export function LandingPage() {
    const navigate = useNavigate();
    const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light');

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
    }, [theme]);

    const toggleTheme = () => {
        setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
    };

    return (
        <div className="lp-root">
            {/* Theme Toggle */}
            <button
                className="lp-theme-toggle"
                onClick={toggleTheme}
                title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
                aria-label="Toggle dark mode"
            >
                {theme === 'light' ? '🌙' : '☀️'}
            </button>

            {/* Background orbs */}
            <div className="lp-orb lp-orb1" />
            <div className="lp-orb lp-orb2" />
            <div className="lp-orb lp-orb3" />

            {/* ── NAVBAR ── */}
            <nav className="lp-nav">
                <div className="lp-nav-inner">
                    <div className="lp-brand">
                        <div className="lp-logo-wrap">
                            <img src="/Ebright Logo 1080px.png" alt="Ebright" className="lp-logo" />
                        </div>
                    </div>
                    <button
                        className="lp-btn lp-btn-primary"
                        onClick={() => navigate('/login')}
                    >
                        Sign In →
                    </button>
                </div>
            </nav>

            {/* ── HERO ── */}
            <section className="lp-hero">
                <div className="lp-hero-inner">
                    <div className="lp-badge">Internal Analytics Platform</div>
                    <h1 className="lp-headline">
                        Your business data,<br />
                        <span className="lp-gradient-text">brilliantly clear.</span>
                    </h1>
                    <p className="lp-subtext">
                        The Ebright Internal Dashboard brings marketing performance, leads
                        tracking, and campaign insights into one unified, role-secured
                        workspace — refreshing live every 3 minutes.
                    </p>
                    <div className="lp-hero-ctas">
                        <button
                            className="lp-btn lp-btn-primary lp-btn-lg"
                            onClick={() => navigate('/login')}
                        >
                            Get Started
                        </button>
                        <a href="#features" className="lp-btn lp-btn-ghost lp-btn-lg">
                            See features ↓
                        </a>
                    </div>
                </div>
                {/* Dynamic Carousel moved outside lp-hero-inner for full 1200px width */}
                <LandingCarousel />
            </section>

            {/* ── STATS STRIP ── */}
            <section className="lp-stats">
                <div className="lp-stats-inner">
                    {stats.map((s) => (
                        <div className="lp-stat-item" key={s.label}>
                            <span className="lp-stat-value">{s.value}</span>
                            <span className="lp-stat-label">{s.label}</span>
                        </div>
                    ))}
                </div>
            </section>

            {/* ── FEATURES ── */}
            <section className="lp-features" id="features">
                <div className="lp-section-inner">
                    <div className="lp-section-header">
                        <div className="lp-badge">What's Inside</div>
                        <h2 className="lp-section-title">
                            Everything your team needs,<br />
                            <span className="lp-gradient-text">nothing it doesn't.</span>
                        </h2>
                        <p className="lp-section-sub">
                            Built specifically for Ebright's internal workflows — marketing,
                            operations, HR, finance, and executive layers all covered.
                        </p>
                    </div>

                    <div className="lp-feature-grid">
                        {features.map((f) => (
                            <div className={`lp-feature-card lp-feature-card--${f.accent}`} key={f.title}>
                                <div className="lp-feature-icon">{f.icon}</div>
                                <h3 className="lp-feature-title">{f.title}</h3>
                                <p className="lp-feature-desc">{f.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── CTA BANNER ── */}
            <section className="lp-cta">
                <div className="lp-cta-inner">
                    <h2 className="lp-cta-title">Ready to get started?</h2>
                    <p className="lp-cta-sub">Sign in with your Ebright account to access the dashboard.</p>
                    <button
                        className="lp-btn lp-btn-primary lp-btn-lg"
                        onClick={() => navigate('/login')}
                    >
                        Sign In to Dashboard →
                    </button>
                </div>
            </section>

            {/* ── FOOTER ── */}
            <footer className="lp-footer">
                <div className="lp-footer-inner">
                    <div className="lp-footer-left">
                        <div className="lp-brand">
                            <div className="lp-logo-wrap lp-logo-wrap--sm">
                                <img src="/Ebright Logo 1080px.png" alt="Ebright" className="lp-logo" />
                            </div>
                        </div>
                        <span className="lp-footer-copy">© {new Date().getFullYear()} Ebright. All rights reserved.</span>
                    </div>
                    <div className="lp-footer-credit">
                        Meticulously crafted by <span className="lp-credit-highlight">Eswarr Ilamaran,OD</span>
                    </div>
                </div>
            </footer>
        </div>
    );
}
