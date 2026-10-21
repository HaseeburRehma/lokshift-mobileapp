/**
 * Legacy route — documents are edited in the sheet on Personal & Fristen.
 */

import { Redirect, useLocalSearchParams } from 'expo-router'

export default function EditQualificationRedirect() {
  const { id } = useLocalSearchParams<{ id: string }>()
  return <Redirect href={{ pathname: '/qualifications', params: id ? { edit: id } : {} } as any} />
}
