import React from 'react';
import {Activity, AlertCircle, ArrowLeft, ArrowRight, Bell, BookOpen, Bot, Calendar, CheckCircle2, ChevronDown, ChevronRight, CircleHelp, ClipboardCheck, CloudOff, Crosshair, Database, FileText, Filter, Gauge, Home, Info, LayoutDashboard, LogOut, Menu, MessageSquareText, MonitorCheck, Moon, MoreVertical, Network, PanelLeft, Settings, Shield, ShieldCheck, Sparkles, TrendingDown, TrendingUp, Upload, UserRound, Users, Wifi, X} from 'lucide-react';
import {NavLink,useLocation,useNavigate} from 'react-router-dom';
import {cn,gradeNames,pct} from './utils';
import { useAuth } from './contexts/AuthContext';

export {cn};

export const Badge=({children,tone='neutral'}:{children:React.ReactNode;tone?:'neutral'|'good'|'warn'|'danger'|'info'})=><span className={cn('badge',`badge-${tone}`)}>{children}</span>;
export const Button=({children,onClick,variant='primary',className='',type='button',disabled=false,style,title}:{children:React.ReactNode;onClick?:()=>void;variant?:'primary'|'secondary'|'ghost'|'danger';className?:string;type?:'button'|'submit';disabled?:boolean;style?:React.CSSProperties;title?:string})=><button type={type} onClick={onClick} disabled={disabled} style={style} title={title} className={cn('btn',`btn-${variant}`,className)}>{children}</button>;
export const Card=({children,className='',style}:{children:React.ReactNode;className?:string;style?:React.CSSProperties})=><div className={cn('card',className)} style={style}>{children}</div>;
export const Progress=({value,label}:{value:number;label?:string})=><div className="progress-wrap">{label&&<div className="progress-label"><span>{label}</span><strong>{value}</strong></div>}<div className="progress"><span style={{width:`${value}%`}}/></div></div>;

export function Layout({children}:{children:React.ReactNode}){
  const [collapsed,setCollapsed]=React.useState(false); 
  const [online,setOnline]=React.useState(navigator.onLine); 
  const loc=useLocation(); 
  const nav=useNavigate(); 
  const { user, isDoctor, logout } = useAuth();
  const todayFormatted = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  
  React.useEffect(()=>{
    const a=()=>setOnline(true),b=()=>setOnline(false);
    window.addEventListener('online',a);
    window.addEventListener('offline',b);
    return()=>{window.removeEventListener('online',a);window.removeEventListener('offline',b)}
  },[]); 
  
  const workspaceItems: any[] = [
    ['/','Dashboard',LayoutDashboard],
    ['/screening/new','New Screening',Sparkles],
    ['/review/queue','Review Queue',ClipboardCheck],
    ['/patients','Patient Directory',UserRound],
    ['/history','Screening History',BookOpen],
    ['/analytics','Performance & Analytics',Activity]
  ]; 

  const systemItems: any[] = [
    ['/settings','Settings',Settings],
    ['/system','Help centre',CircleHelp]
  ];
  
  const getPageTitle = (pathname: string) => {
    if (pathname.includes('/history') && pathname.startsWith('/patients/')) {
      return 'Patient Directory / Longitudinal Retinal Progression History';
    }
    if (pathname.startsWith('/patients/') && pathname !== '/patients/records') {
      return 'Patient Directory / Patient Profile';
    }
    if (pathname.startsWith('/history/') || (pathname.startsWith('/screening/') && !['/screening/new', '/screening/capture', '/screening/quality', '/screening/analyze', '/screening/result', '/screening/explain', '/screening/review', '/screening/report'].includes(pathname))) {
      const parts = pathname.split('/');
      const id = parts[parts.length - 1];
      return `Screening History / ${id}`;
    }
    const titles: Record<string, string> = {
      '/': 'Dashboard',
      '/screening/new': 'New Screening',
      '/patients': 'Patient Directory / Open Records',
      '/patients/records': 'Patient Directory / Open Records',
      '/history': 'Screening History',
      '/reports': 'Reports',
      '/analytics': 'Performance & Analytics',
      '/system': 'Help centre',
      '/settings': 'Settings',
      '/screening/result': 'AI Screening Result',
      '/screening/quality': 'AI Image Quality Coach',
      '/screening/analyze': 'AI Analysis',
      '/screening/review': 'Review Queue',
      '/screening/explain': 'Model Explainability',
      '/review/queue': 'Review Queue'
    };
    return titles[pathname] ?? 'Dashboard';
  };
  
  const displayName = React.useMemo(() => {
    const raw = user?.full_name?.trim();
    if (user?.role === 'doctor') {
      if (!raw || raw.toLowerCase() === 'doctor' || raw.toLowerCase() === 'doctor1' || raw === 'Dr.' || raw === 'Dr' || raw === 'Dr. Smith') {
        return 'Dr. Anita Sharma';
      }
      if (/^dr\.?\s+/i.test(raw)) {
        return raw;
      }
      return `Dr. ${raw}`;
    }
    return raw || 'Anita Sharma';
  }, [user]);

  const displayRole = user?.role === 'doctor' ? 'Ophthalmic reviewer' : (user ? user.role : 'Ophthalmic reviewer');
  const initials = displayName.replace(/^dr\.?\s+/i, '').split(' ').filter(Boolean).map(n=>n[0]).join('').substring(0,2).toUpperCase() || 'AS';

  return <div className={cn('app',collapsed&&'sidebar-collapsed')}>
    <aside className="sidebar">
      {/* Sidebar Branding */}
      <div className="sidebar-branding">
        <div className="sidebar-brand-left">
          <div className="sidebar-logo-mark" title="RetinaAI Medical Core">
            <Activity size={20} strokeWidth={2.4} color="#0d4f53" />
          </div>
          {!collapsed&&<div>
            <div className="sidebar-brand-name">RetinaAI</div>
            <div className="sidebar-brand-sub">DR SCREENING PLATFORM</div>
          </div>}
        </div>
        <button className="collapse-btn" onClick={()=>setCollapsed(v=>!v)} aria-label="Toggle sidebar"><PanelLeft size={17}/></button>
      </div>

      {/* Navigation Sections */}
      <div className="sidebar-nav-container">
        {!collapsed && <div className="sidebar-section-label">WORKSPACE</div>}
        <nav>
          {workspaceItems.map(([to,label,Icon,badge]:any)=>(
            <NavLink key={to} to={to} className={({isActive})=>cn('sidebar-nav-item',isActive&&'active')}>
              <div style={{display:'flex',alignItems:'center',gap:11}}>
                <Icon size={18}/>
                {!collapsed&&<span>{label}</span>}
              </div>
              {!collapsed && badge && <span className="sidebar-badge-amber">{badge}</span>}
            </NavLink>
          ))}
        </nav>

        {!collapsed && <div className="sidebar-section-label" style={{marginTop:8}}>SYSTEM</div>}
        <nav>
          {systemItems.map(([to,label,Icon]:any)=>(
            <NavLink key={to} to={to} className={({isActive})=>cn('sidebar-nav-item',isActive&&'active')}>
              <div style={{display:'flex',alignItems:'center',gap:11}}>
                <Icon size={18}/>
                {!collapsed&&<span>{label}</span>}
              </div>
            </NavLink>
          ))}
        </nav>
      </div>

      {/* Sidebar Footer */}
      <div className="sidebar-footer-wrap">
        {!collapsed && (
          <div className="sidebar-safety-panel">
            <Shield size={16}/>
            <div>
              <div className="sidebar-safety-title">Safety first</div>
              <div className="sidebar-safety-sub">All screenings are audit logged.</div>
            </div>
          </div>
        )}
        
        <div className="sidebar-profile">
          <div className="sidebar-profile-left">
            <div className="sidebar-avatar">{initials}</div>
            {!collapsed && (
              <div style={{minWidth:0}}>
                <div className="sidebar-profile-name">{displayName}</div>
                <div className="sidebar-profile-role">{displayRole}</div>
              </div>
            )}
          </div>
          {!collapsed && (
            <button className="icon-btn" onClick={() => { logout(); nav('/login'); }} title="Logout" style={{color:'#8ba2a2',padding:4}}>
              <LogOut size={16}/>
            </button>
          )}
        </div>
      </div>
    </aside>

    <main className="main">
      {/* Slim White Clinical Header */}
      <header className="topbar-clinical">
        <div className="topbar-left-clinical">
          <button className="mobile-menu" onClick={()=>setCollapsed(v=>!v)}><Menu size={20}/></button>
          <div style={{display:'flex',alignItems:'center',gap:6,cursor:'pointer'}} onClick={()=>nav('/')}>
            <div style={{width:8,height:8,borderRadius:'50%',background:'var(--clinical-mint)'}}/>
            <strong style={{fontSize:14,fontFamily:'var(--font-display)',color:'#132b2e'}}>RetinaAI</strong>
            <ChevronDown size={14} style={{color:'#7c9496'}}/>
          </div>
          <span style={{color:'#cfdedd',margin:'0 4px'}}>/</span>
          <div style={{fontFamily:'var(--font-body)',fontWeight:600,fontSize:13.5,color:'#567073'}}>
            {getPageTitle(loc.pathname)}
          </div>
        </div>

        <div className="topbar-right-clinical">
          <div className="facility-pill">
            <div style={{width:8,height:8,borderRadius:'50%',background:online?'#2a976d':'#c86b47'}}/>
            <span style={{color:'#789193',fontSize:11}}>Active facility</span>
            <strong style={{fontWeight:700,color:'#183639'}}>Jorhat Community Clinic</strong>
            <ChevronDown size={13} style={{color:'#799294'}}/>
          </div>

          <div className="header-date-pill">
            <Calendar size={14} style={{color:'#678184'}}/>
            <span>{todayFormatted}</span>
          </div>

          <div style={{position:'relative'}}>
            <button className="icon-btn" style={{color:'#465a5d',background:'#f4f8f8',borderRadius:10,border:'1px solid #dce7e6'}} title="Notifications">
              <Bell size={17}/>
              <span className="coral-dot-notif"/>
            </button>
          </div>
        </div>
      </header>

      <div className="content">{children}</div>
    </main>
  </div>
}
export const SectionHeader=({eyebrow,title,description,action}:{eyebrow?:string;title:string;description?:string;action?:React.ReactNode})=><div className="section-header"><div>{eyebrow&&<div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1>{description&&<p>{description}</p>}</div>{action}</div>;
export const Disclaimer=()=> <div className="disclaimer"><ShieldCheck size={16}/><span>AI-generated screening support. Final clinical decision should be made by a qualified healthcare professional.</span></div>;
export const RetinaImage=({eye='Left Eye',className=''}:{eye?:string;className?:string})=><div className={cn('retina-frame',className)}><img src="/retina.svg" alt={`${eye} retinal fundus demo`}/><span className="image-tag">{eye}</span></div>;
export const Stepper=({active=1}:{active?:number})=><div className="stepper">{['Patient','Capture','AI Analysis','Results','Review','Report'].map((x,i)=><React.Fragment key={x}><div className={cn('step',i+1===active&&'active',i+1<active&&'done')}><span>{i+1<active?<CheckCircle2 size={15}/>:String(i+1).padStart(2,'0')}</span><label>{x}</label></div>{i<5&&<div className={cn('step-line',i+1<active&&'done')}/>}</React.Fragment>)}</div>;
export const MetricCard=({label,value,delta,icon:Icon}:any)=><Card className="metric-card"><div className="metric-top"><span>{label}</span><div className="metric-icon"><Icon size={17}/></div></div><div className="metric-value">{value}</div>{delta&&<div className="metric-delta">{delta}</div>}</Card>;
export const GradeBadge=({grade}:{grade:number})=><Badge tone={grade>=2?'danger':grade===1?'warn':'good'}>{grade} · {gradeNames[grade as any]}</Badge>;
