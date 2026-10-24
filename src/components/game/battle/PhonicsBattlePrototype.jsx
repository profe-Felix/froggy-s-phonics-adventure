import React, { useEffect, useMemo, useRef, useState } from 'react';

/**
 * Standalone prototype. Does not touch existing Base44 student data.
 * Later: replace emoji placeholders with Craftpix sprites and connect to the game router.
 */
const CHALLENGES = [
  { kind: 'sonido', answer: 'm', speak: 'mmm', hint: 'La letra m hace mmm.' },
  { kind: 'sonido', answer: 'a', speak: 'a', hint: 'La vocal a suena a.' },
  { kind: 'sonido', answer: 'p', speak: 'p', hint: 'La letra p hace /p/.' },
  { kind: 'sílaba', answer: 'ma', speak: 'ma', hint: 'Junta m con a: ma.' },
  { kind: 'sonido', answer: 's', speak: 'sss', hint: 'La letra s hace sss.' },
  { kind: 'sílaba', answer: 'pa', speak: 'pa', hint: 'Junta p con a: pa.' },
  { kind: 'palabra', answer: 'mapa', speak: 'mapa', hint: 'Escribe ma y luego pa.' },
  { kind: 'sílaba', answer: 'sa', speak: 'sa', hint: 'Junta s con a: sa.' },
  { kind: 'palabra', answer: 'masa', speak: 'masa', hint: 'Escribe ma y luego sa.' },
  { kind: 'palabra', answer: 'mamá', speak: 'mamá', hint: 'Escribe ma y luego má.' },
];
const KEYS = ['m','p','s','a','e','i','o','u','á','⌫'];
const MONSTERS = ['👾', '👹', '🐲'];
const MAX_HEARTS = 3;
const css = `
.battle-root{min-height:100dvh;background:#101b30;color:#fff;font-family:system-ui,sans-serif;padding:16px;box-sizing:border-box}
.battle-wrap{max-width:950px;margin:auto}
.battle-top{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center}
.battle-scene{position:relative;height:300px;overflow:hidden;border:4px solid #476451;border-radius:18px;background:linear-gradient(#7bd3ee 0%,#b5e9ef 60%,#7cc57d 60%,#398449 100%);margin:14px 0}
.battle-cloud{position:absolute;top:24px;left:10%;font-size:54px;opacity:.8}
.battle-hill{position:absolute;bottom:47px;left:-10%;width:130%;height:100px;background:#5aaa68;border-radius:50% 50% 0 0}
.battle-ground{position:absolute;bottom:0;height:56px;width:100%;background:repeating-linear-gradient(90deg,#6e5837 0 45px,#78603a 45px 90px);border-top:13px solid #478f3f}
.battle-hero,.battle-monster{position:absolute;bottom:58px;font-size:90px;line-height:1;transition:transform .25s}
.battle-hero{left:18%;transform:scaleX(-1)}.battle-monster{right:17%}
.battle-hero.attack{transform:translateX(95px) scaleX(-1)}.battle-monster.hurt{transform:translateX(18px) rotate(12deg)}
.battle-card{background:#f9f9f0;color:#172439;padding:16px;border-radius:18px;text-align:center}
.battle-keyboard{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;max-width:560px;margin:12px auto}
.battle-keyboard button{min-height:55px;border:2px solid #8eabd0;border-radius:12px;background:#fff;font-size:27px;font-weight:800;color:#17385b;touch-action:manipulation}
.battle-keyboard button:active{background:#d9f0ff}
.battle-primary{padding:12px 24px;background:#186b9c;color:white;border:0;border-radius:12px;font-size:18px;font-weight:700}
.battle-primary:disabled{opacity:.4}
.battle-answer{display:inline-block;min-width:125px;min-height:45px;background:white;border:2px dashed #6791ac;border-radius:9px;padding:5px 16px;font-size:30px;font-weight:bold;letter-spacing:4px}
.battle-meter{height:12px;width:170px;background:#3e4653;border-radius:8px;overflow:hidden}
.battle-meter>div{height:100%;background:#ed6356;transition:width .2s}
@media(max-width:540px){.battle-scene{height:230px}.battle-hero,.battle-monster{font-size:70px}.battle-hero{left:8%}.battle-monster{right:8%}}
`;

export default function PhonicsBattlePrototype() {
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState('');
  const [attempt, setAttempt] = useState(1);
  const [hearts, setHearts] = useState(MAX_HEARTS);
  const [monsterHP, setMonsterHP] = useState(100);
  const [phase, setPhase] = useState('question');
  const [message, setMessage] = useState('¡Escucha y escribe para atacar!');
  const [points, setPoints] = useState(0);
  const [motion, setMotion] = useState('');
  const timer = useRef(null);
  const challenge = CHALLENGES[index];
  const monster = MONSTERS[Math.floor(index / 3) % MONSTERS.length];
  const finished = index >= CHALLENGES.length || hearts <= 0;

  const speak = () => {
    if (!challenge || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(challenge.speak);
    utterance.lang = 'es-ES'; utterance.rate = 0.75;
    window.speechSynthesis.speak(utterance);
  };
  useEffect(() => {
    return () => { if (timer.current) clearTimeout(timer.current); window.speechSynthesis?.cancel(); };
  }, []);

  const addKey = (key) => {
    if (phase !== 'question' || finished) return;
    if (key === '⌫') setAnswer(a => a.slice(0,-1));
    else setAnswer(a => a.length < 8 ? a + key : a);
  };
  const next = () => {
    setIndex(i => i+1); setMonsterHP(100); setAnswer(''); setAttempt(1);
    setPhase('question'); setMessage('¡Nuevo enemigo! Escucha y escribe.');
    setMotion('');
  };
  const submit = () => {
    if (!challenge || !answer || phase !== 'question') return;
    if (answer.trim().toLowerCase() === challenge.answer) {
      const damage = attempt === 1 ? 100 : 50;
      const remaining = Math.max(0, monsterHP-damage);
      setMonsterHP(remaining); setPoints(p => p+(attempt===1?10:5));
      setMotion('attack'); setAnswer('');
      if (remaining === 0) {
        setPhase('defeated'); setMessage(attempt===1?'¡Ataque perfecto!':'¡Monstruo derrotado!');
      } else {
        setPhase('question'); setAttempt(1);
        setMessage('¡Buen ataque! El monstruo sigue en pie. Intenta otro golpe.');
      }
      timer.current = setTimeout(() => setMotion(''), 500);
    } else if (attempt < 2) {
      setAttempt(2); setAnswer('');
      setMessage('¡Inténtalo otra vez! Escucha con atención.');
      speak();
    } else {
      setHearts(h => Math.max(0,h-1)); setAttempt(1); setAnswer('');
      setMotion('hurt'); setPhase('feedback');
      setMessage('El monstruo contraataca. '+challenge.hint);
      timer.current = setTimeout(() => setMotion(''), 500);
    }
  };
  const retry = () => {
    setIndex(0); setAnswer(''); setAttempt(1); setHearts(MAX_HEARTS);
    setMonsterHP(100); setPoints(0); setPhase('question');
    setMessage('¡Escucha y escribe para atacar!');
  };
  return <main className="battle-root">
    <style>{css}</style>
    <div className="battle-wrap">
      <header className="battle-top">
        <h1 style={{fontSize:24,margin:0}}>⚔️ ¡Batalla de palabras!</h1>
        <div>❤️ {hearts}/{MAX_HEARTS} · ⭐ {points} · Batalla {Math.min(index+1,CHALLENGES.length)}/{CHALLENGES.length}</div>
      </header>
      <div className="battle-scene" aria-label="Escena de batalla entre héroe y monstruo">
        <div className="battle-cloud">☁️</div><div className="battle-hill"/><div className="battle-ground"/>
        <div className={'battle-hero '+(motion==='attack'?'attack':'')}>🦸</div>
        <div className={'battle-monster '+(motion==='hurt'?'hurt':'')}>{monsterHP>0 && monster}</div>
        <div style={{position:'absolute',right:12,top:12,background:'#18283c',padding:10,borderRadius:12}}>
          Monstruo: {monsterHP} HP<div className="battle-meter"><div style={{width:monsterHP+'%'}}/></div>
        </div>
      </div>
      <section className="battle-card" aria-live="polite">
        {finished ? <>
          <h2>{hearts===0?'¡Buen esfuerzo!':'¡Aventura completada!'}</h2>
          <p>Conseguiste {points} puntos.</p>
          <button className="battle-primary" onClick={retry}>Volver a jugar</button>
        </> : <>
          <div style={{fontWeight:700,color:'#47647a'}}>{challenge.kind.toUpperCase()} · Intento {attempt}/2</div>
          <h2 style={{fontSize:19}}>{message}</h2>
          {phase==='question' ? <>
            <button className="battle-primary" onClick={speak}>🔊 Escuchar</button>
            <div style={{marginTop:12}}><span className="battle-answer">{answer || '___'}</span></div>
            <div className="battle-keyboard">{KEYS.map(k=><button key={k} onClick={()=>addKey(k)}>{k}</button>)}</div>
            <button className="battle-primary" disabled={!answer} onClick={submit}>⚔️ Atacar</button>
          </> : phase==='feedback' ? <>
            <p>Respuesta correcta: <strong style={{fontSize:30}}>{challenge.answer}</strong></p>
            <button className="battle-primary" onClick={speak}>🔊 Escuchar respuesta</button>{' '}
            <button className="battle-primary" onClick={()=>{setPhase('question');setMessage('¡Prueba de nuevo!');}}>Intentar otra vez</button>
          </> : <button className="battle-primary" onClick={next}>➡️ Avanzar</button>}
        </>}
      </section>
      <p style={{opacity:.75,textAlign:'center',fontSize:13}}>Prototipo aislado: sin cambios en datos de estudiantes. Audio provisional del navegador.</p>
    </div>
  </main>;
}
