import { Link } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/PageHeader'

export default function NotFound() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="404"
        title="No such page"
        actions={
          <Button asChild>
            <Link to="/">Back to accounts</Link>
          </Button>
        }
      />
    </div>
  )
}
