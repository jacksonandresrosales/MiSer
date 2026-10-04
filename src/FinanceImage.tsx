import { useEffect, useRef, useState } from 'react'
import { doc, getDoc } from 'firebase/firestore/lite'
import { firebaseAuth, firestore } from './firebase'
import { mediaId } from './financeMedia'
import { profilePhotoSrc } from './userProfile'

export function FinanceImage({ source, alt, className, size = 48 }: { source?: string; alt: string; className?: string; size?: number }) {
  const host = useRef<HTMLSpanElement>(null)
  const [resolved, setResolved] = useState<{ source: string; uid: string; url: string } | null>(null)
  const uid = firebaseAuth?.currentUser?.uid ?? ''
  const asset = mediaId(source)
  const direct = profilePhotoSrc(source ?? '')
  useEffect(() => {
    if (!asset || !uid || !firestore || !host.current) return
    let alive = true
    let requested = false
    const load = () => {
      if (requested) return
      requested = true
      void getDoc(doc(firestore!, 'finance_data', uid, 'media', asset)).then(snapshot => {
        const url = profilePhotoSrc(snapshot.data()?.imageUrl ?? '')
        if (alive && url && firebaseAuth?.currentUser?.uid === uid) setResolved({ source: source!, uid, url })
      }).catch(() => { /* Missing media never prevents displaying financial records. */ })
    }
    const observer = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { observer?.disconnect(); load() }
    }, { rootMargin: '100px' }) : null
    if (observer) observer.observe(host.current)
    else load()
    return () => { alive = false; observer?.disconnect() }
  }, [asset, uid, source])
  const url = direct ?? (resolved && resolved.source === source && resolved.uid === uid ? resolved.url : null)
  if (!asset && !direct) return null
  return <span ref={host} className={className} style={{ display: 'inline-block', width: size, height: size }}>
    {url ? <img src={url} alt={alt} width={size} height={size} loading="lazy" decoding="async" referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} /> : <span role="img" aria-label={alt} />}
  </span>
}
