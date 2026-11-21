import type { ReactNode } from 'react'
import { profileInitials, profilePhotoSrc, type UserProfile } from '../userProfile'

export function BrandMark({ size = 36 }: { size?: number }) {
  return <span className="brand-mark" style={{ width: size, height: size }}><img src="/favicon.svg" alt="" width={size} height={size} /></span>
}

export function ProfileAvatar({ profile, className = 'avatar' }: { profile: UserProfile; className?: string }) {
  const src = profilePhotoSrc(profile.photoURL)
  return <span className={className} aria-hidden="true">{profileInitials(profile.displayName)}{src && <img key={src} src={src} alt="" referrerPolicy="no-referrer" onError={event => { event.currentTarget.hidden = true }} />}</span>
}

/** Page title. It receives focus after navigation so the new screen is announced. */
export function PageHeading({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return <div className="page-heading"><div><h1 id="page-title" tabIndex={-1}>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>{action}</div>
}

export function EmptyState({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action?: ReactNode }) {
  return <div className="empty-state"><span className="empty-icon" aria-hidden="true">{icon}</span><strong>{title}</strong><p>{text}</p>{action}</div>
}
