import logo from './assets/cooviacademy.png';
import coovitel from './assets/logo-coovitel.png';

export default function AcademyLogo() {
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
    <img src={coovitel} alt="Coovitel"
      style={{ width: 'clamp(65px, 8vw, 95px)', height: '32px', objectFit: 'contain', filter: 'brightness(0) invert(1)' }} />
    <span aria-hidden="true" style={{ width: '1px', height: '22px', background: 'rgba(255,255,255,0.2)' }} />
    <img src={logo} alt="CooviAcademy" width={150} height={32}
      style={{ width: 'clamp(105px, 13vw, 150px)', height: '32px', objectFit: 'cover', objectPosition: 'center' }} />
  </span>;
}
