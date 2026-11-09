import { useCallback, useEffect, useState } from 'react'
import { listTransactions } from '../services/api.js'

export function useTransactions() {
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const rows = await listTransactions()
      setTransactions(rows)
      return rows
    } catch (requestError) {
      setError(requestError.message || 'No se pudieron cargar los movimientos.')
      throw requestError
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true

    listTransactions()
      .then((rows) => {
        if (active) setTransactions(rows)
      })
      .catch((requestError) => {
        if (active) setError(requestError.message || 'No se pudieron cargar los movimientos.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  return { transactions, loading, error, refresh, setError }
}
