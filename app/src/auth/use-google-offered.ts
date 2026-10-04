import { useEffect, useState } from 'react'
import { googleOffered } from './sign-in'

/** Whether to offer Google: false until the auth project says it is on. */
export function useGoogleOffered(): boolean {
  const [offered, setOffered] = useState(false)
  useEffect(() => {
    let live = true
    void googleOffered().then((yes) => {
      if (live) setOffered(yes)
    })
    return () => {
      live = false
    }
  }, [])
  return offered
}
