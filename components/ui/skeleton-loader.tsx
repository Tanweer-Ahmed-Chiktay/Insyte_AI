import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { cn } from "@/lib/utils"

interface SkeletonLoaderProps {
  className?: string
  count?: number
}

export function EmailListSkeleton({ className, count = 5 }: SkeletonLoaderProps) {
  return (
    <div className={cn("space-y-1 p-2", className)}>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="p-3 rounded-lg border border-border">
          <div className="flex items-start space-x-3">
            {/* Avatar skeleton */}
            <Skeleton className="h-8 w-8 rounded-full flex-shrink-0" />
            
            <div className="flex-1 min-w-0 space-y-2">
              {/* Header row with sender and time */}
              <div className="flex items-center justify-between">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-12" />
              </div>
              
              {/* Subject line */}
              <Skeleton className="h-4 w-3/4" />
              
              {/* Preview text */}
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-4/5" />
            </div>
            
            {/* Status indicators */}
            <div className="flex flex-col space-y-1 flex-shrink-0">
              <Skeleton className="h-4 w-4 rounded" />
              <Skeleton className="h-4 w-4 rounded" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export function EmailDetailSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("p-6 space-y-6", className)}>
      {/* Email header */}
      <div className="space-y-4 border-b border-border pb-4">
        {/* Subject and time */}
        <div className="flex items-start justify-between">
          <Skeleton className="h-7 w-3/4" /> {/* Subject */}
          <Skeleton className="h-4 w-20" /> {/* Time */}
        </div>
        
        {/* Sender info */}
        <div className="flex items-center space-x-3">
          <Skeleton className="h-12 w-12 rounded-full" /> {/* Avatar */}
          <div className="space-y-2">
            <Skeleton className="h-4 w-32" /> {/* Sender name */}
            <Skeleton className="h-3 w-48" /> {/* Email address */}
          </div>
        </div>
        
        {/* Action buttons */}
        <div className="flex space-x-2">
          <Skeleton className="h-9 w-20 rounded-md" />
          <Skeleton className="h-9 w-20 rounded-md" />
          <Skeleton className="h-9 w-20 rounded-md" />
          <Skeleton className="h-9 w-16 rounded-md" />
        </div>
      </div>
      
      {/* Email content */}
      <div className="space-y-4">
        {/* Paragraph 1 */}
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
        
        {/* Paragraph 2 */}
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
        
        {/* Large content block */}
        <div className="py-4">
          <Skeleton className="h-24 w-full rounded-md" />
        </div>
        
        {/* Paragraph 3 */}
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
        
        {/* Attachments section */}
        <div className="mt-8 space-y-3">
          <Skeleton className="h-5 w-24" /> {/* "Attachments" label */}
          <div className="grid grid-cols-2 gap-3 max-w-md">
            <div className="flex items-center space-x-2 p-3 border border-border rounded-md">
              <Skeleton className="h-8 w-8 rounded" />
              <div className="space-y-1">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-2 w-12" />
              </div>
            </div>
            <div className="flex items-center space-x-2 p-3 border border-border rounded-md">
              <Skeleton className="h-8 w-8 rounded" />
              <div className="space-y-1">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-2 w-16" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function EmailComposeSkeleton({ className }: { className?: string }) {
  return (
    <Card className={cn("p-6", className)}>
      <div className="space-y-4">
        {/* To field */}
        <div className="space-y-2">
          <Skeleton className="h-4 w-8" /> {/* "To" label */}
          <Skeleton className="h-10 w-full" />
        </div>
        
        {/* Subject field */}
        <div className="space-y-2">
          <Skeleton className="h-4 w-12" /> {/* "Subject" label */}
          <Skeleton className="h-10 w-full" />
        </div>
        
        {/* Compose toolbar */}
        <div className="flex space-x-2 py-2">
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-8 w-8" />
        </div>
        
        {/* Content area */}
        <Skeleton className="h-64 w-full" />
        
        {/* Action buttons */}
        <div className="flex justify-between pt-4">
          <div className="flex space-x-2">
            <Skeleton className="h-9 w-20" /> {/* Send */}
            <Skeleton className="h-9 w-16" /> {/* Save */}
          </div>
          <Skeleton className="h-9 w-16" /> {/* Cancel */}
        </div>
      </div>
    </Card>
  )
}

export function EmailSidebarSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("space-y-4 p-4", className)}>
      {/* Compose button */}
      <Skeleton className="h-10 w-full rounded-md" />
      
      {/* Navigation items */}
      <div className="space-y-1">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="flex items-center space-x-3 p-3 rounded-lg">
            <Skeleton className="h-4 w-4" /> {/* Icon */}
            <Skeleton className="h-4 w-20" /> {/* Label */}
            <Skeleton className="h-4 w-6 ml-auto" /> {/* Count */}
          </div>
        ))}
      </div>
      
      {/* Labels section */}
      <div className="pt-4 space-y-3">
        <Skeleton className="h-4 w-16" /> {/* "Labels" header */}
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="flex items-center space-x-3 p-2 rounded-md">
              <Skeleton className="h-3 w-3 rounded-full" /> {/* Color dot */}
              <Skeleton className="h-3 w-24" /> {/* Label name */}
            </div>
          ))}
        </div>
      </div>
      
      {/* Storage info */}
      <div className="pt-6 space-y-2">
        <Skeleton className="h-4 w-20" /> {/* "Storage" header */}
        <Skeleton className="h-2 w-full rounded-full" /> {/* Progress bar */}
        <Skeleton className="h-3 w-32" /> {/* Storage text */}
      </div>
    </div>
  )
}

export function EmailStatsCardSkeleton({ className }: { className?: string }) {
  return (
    <Card className={cn("p-4", className)}>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-20" /> {/* Title */}
          <Skeleton className="h-4 w-4" /> {/* Icon */}
        </div>
        <Skeleton className="h-8 w-16" /> {/* Large number */}
        <Skeleton className="h-3 w-32" /> {/* Description */}
      </div>
    </Card>
  )
}

// Compact skeleton for email list items in dense view
export function EmailListItemSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center space-x-3 p-3 border-b", className)}>
      <Skeleton className="h-4 w-4" /> {/* Checkbox */}
      <Skeleton className="h-4 w-4" /> {/* Star */}
      <Skeleton className="h-6 w-6 rounded-full" /> {/* Small avatar */}
      <div className="flex-1 space-y-1">
        <div className="flex items-center justify-between">
          <Skeleton className="h-3 w-24" /> {/* Sender */}
          <Skeleton className="h-3 w-12" /> {/* Time */}
        </div>
        <Skeleton className="h-3 w-3/4" /> {/* Subject */}
      </div>
    </div>
  )
}

// Loading state for search results
export function EmailSearchSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("space-y-4", className)}>
      {/* Search header */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-48" /> {/* "Search results for..." */}
        <Skeleton className="h-4 w-20" /> {/* Result count */}
      </div>
      
      {/* Filter chips */}
      <div className="flex space-x-2">
        <Skeleton className="h-6 w-16 rounded-full" />
        <Skeleton className="h-6 w-20 rounded-full" />
        <Skeleton className="h-6 w-14 rounded-full" />
      </div>
      
      {/* Search results */}
      <EmailListSkeleton count={3} />
    </div>
  )
}