import { useEffect, useState } from 'react'
import { AuthContext } from './authContext.js'
import {
  confirmSignUp,
  getCurrentUser,
  resendSignUpCode,
  signIn,
  signOut,
  signUp,
} from 'aws-amplify/auth'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    getCurrentUser()
      .then((currentUser) => {
        if (active) setUser(currentUser)
      })
      .catch(() => {
        if (active) setUser(null)
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  async function login(email, password) {
    const result = await signIn({ username: email, password })
    if (result.isSignedIn) setUser(await getCurrentUser())
    return result
  }

  async function register(email, password) {
    return signUp({
      username: email,
      password,
      options: { userAttributes: { email } },
    })
  }

  async function confirmRegistration(email, code) {
    return confirmSignUp({ username: email, confirmationCode: code })
  }

  async function resendRegistrationCode(email) {
    return resendSignUpCode({ username: email })
  }

  async function logout() {
    await signOut()
    setUser(null)
  }

  const value = {
    user,
    loading,
    login,
    register,
    confirmRegistration,
    resendRegistrationCode,
    logout,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
