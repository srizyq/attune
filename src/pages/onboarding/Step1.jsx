// src/pages/onboarding/Step1.jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import OnboardingLayout from '../../components/OnboardingLayout';

const goals = [
  {
    id: 'lose',
    label: 'Lose weight',
    desc: 'Burn fat while keeping energy up',
    icon: '↓',
    color: '#6aabcf',
  },
  {
    id: 'maintain',
    label: 'Stay balanced',
    desc: 'Maintain weight and build healthy habits',
    icon: '◎',
    color: '#8fbc8f',
  },
  {
    id: 'build',
    label: 'Build muscle',
    desc: 'Fuel growth with the right macros',
    icon: '↑',
    color: '#9f97e8',
  },
];

export default function Step1() {
  const navigate = useNavigate();
  const [selected, setSelected] = useState(null);
  const [hovered, setHovered] = useState(null);

  const handleNext = () => {
    if (!selected) return;
    // Save to sessionStorage so later steps can read it
    const existing = JSON.parse(sessionStorage.getItem('attune_onboarding') || '{}');
    sessionStorage.setItem('attune_onboarding', JSON.stringify({ ...existing, goal: selected }));
    navigate('/onboarding/step2');
  };

  return (
    <OnboardingLayout step={1}>
      <div style={{ width: '100%', maxWidth: '520px', textAlign: 'center' }}>

        {/* Heading */}
        <p style={{ color: 'var(--text-muted)', fontSize: '13px', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '12px' }}>
          let's personalise your experience
        </p>
        <h1 style={{
          fontFamily: "'Syne', sans-serif",
          fontSize: 'clamp(28px, 5vw, 40px)',
          fontWeight: 700,
          color: 'var(--text-primary)',
          lineHeight: 1.15,
          marginBottom: '10px',
        }}>
          What's your main goal?
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '15px', marginBottom: '40px' }}>
          We'll set your calorie targets and macro splits around this.
        </p>

        {/* Goal cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '36px' }}>
          {goals.map(g => {
            const isSelected = selected === g.id;
            const isHovered = hovered === g.id;
            return (
              <button
                key={g.id}
                onClick={() => setSelected(g.id)}
                onMouseEnter={() => setHovered(g.id)}
                onMouseLeave={() => setHovered(null)}
                style={{
                  background: isSelected ? 'var(--bg-card)' : 'var(--bg-subtle)',
                  border: `1px solid ${isSelected ? g.color : (isHovered ? 'var(--border-active)' : 'var(--border-default)')}`,
                  borderRadius: '12px',
                  padding: '20px 24px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '20px',
                  textAlign: 'left',
                  transition: 'all 0.2s ease',
                  outline: 'none',
                  transform: isSelected ? 'translateX(4px)' : 'translateX(0)',
                }}
              >
                {/* Icon */}
                <div style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '10px',
                  background: isSelected ? `${g.color}18` : 'var(--bg-card)',
                  border: `1px solid ${isSelected ? g.color : 'var(--border-default)'}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '20px',
                  color: isSelected ? g.color : 'var(--text-hint)',
                  flexShrink: 0,
                  transition: 'all 0.2s ease',
                  fontWeight: 300,
                }}>
                  {g.icon}
                </div>

                {/* Text */}
                <div style={{ flex: 1 }}>
                  <div style={{
                    color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
                    fontWeight: 600,
                    fontSize: '16px',
                    marginBottom: '3px',
                    fontFamily: "'Syne', sans-serif",
                    transition: 'color 0.2s',
                  }}>
                    {g.label}
                  </div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>{g.desc}</div>
                </div>

                {/* Selected indicator */}
                <div style={{
                  width: '20px',
                  height: '20px',
                  borderRadius: '50%',
                  border: `2px solid ${isSelected ? g.color : 'var(--border-default)'}`,
                  background: isSelected ? g.color : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  transition: 'all 0.2s ease',
                }}>
                  {isSelected && (
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#0f0f0f' }} />
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Back + Next */}
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => navigate('/onboarding/welcome')}
            style={{
              flex: '0 0 auto',
              padding: '16px 20px',
              background: 'transparent',
              border: '1px solid var(--border-default)',
              borderRadius: '10px',
              color: 'var(--text-muted)',
              fontSize: '15px',
              cursor: 'pointer',
              fontFamily: "'Plus Jakarta Sans', sans-serif",
            }}
          >
            ←
          </button>
          <button
            onClick={handleNext}
            disabled={!selected}
            style={{
              flex: 1,
              padding: '16px',
              background: selected ? 'var(--accent)' : 'var(--bg-card)',
              border: `1px solid ${selected ? 'var(--accent)' : 'var(--border-default)'}`,
              borderRadius: '10px',
              color: selected ? '#0f0f0f' : 'var(--text-hint)',
              fontSize: '15px',
              fontWeight: 600,
              cursor: selected ? 'pointer' : 'not-allowed',
              transition: 'all 0.2s ease',
              fontFamily: "'Plus Jakarta Sans', sans-serif",
            }}
          >
            Continue →
          </button>
        </div>
      </div>
    </OnboardingLayout>
  );
}
