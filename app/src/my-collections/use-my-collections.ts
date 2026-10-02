import { useContext } from 'react'

import { MyCollectionsContext, type MyCollectionsValue } from './context'

/**
 * The signed-in reader's collections, or `available: false`.
 *
 * Does not throw outside the provider: the default value is "not available",
 * so a component that offers to save a document renders nothing wherever the
 * provider is absent, which is the same thing it does when the feature is off.
 */
export function useMyCollections(): MyCollectionsValue {
  return useContext(MyCollectionsContext)
}
