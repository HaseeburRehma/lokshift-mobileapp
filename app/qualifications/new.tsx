/**
 * Legacy route — documents are now added in the sheet on Personal & Fristen.
 */

import { Redirect, useLocalSearchParams } from 'expo-router'

export default function NewQualificationRedirect() {
  const { employee } = useLocalSearchParams<{ employee?: string }>()
  return <Redirect href={{ pathname: '/qualifications', params: employee ? { action: 'new', employee } : { action: 'new' } } as any} />
}
