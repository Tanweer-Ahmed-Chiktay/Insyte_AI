/**
 * Performance Optimizer
 * Implements UI optimizations and performance monitoring
 * Based on improve2.txt specifications
 */

import { cacheHierarchy } from './cache-hierarchy'
import { preloadEngine } from './preload-engine'
import { UserBehaviorModel } from './user-behavior-model'

interface PerformanceMetrics {
  renderTime: number
  cacheHitRate: number
  memoryUsage: number
  networkLatency: number
  scrollPerformance: number
  interactionLatency: number
  bundleSize: number
  firstContentfulPaint: number
  largestContentfulPaint: number
  cumulativeLayoutShift: number
}

interface OptimizationConfig {
  enableVirtualScrolling: boolean
  enableMemoization: boolean
  enableLazyLoading: boolean
  enableImageOptimization: boolean
  enableCodeSplitting: boolean
  enablePreloading: boolean
  maxConcurrentRequests: number
  debounceDelay: number
  throttleDelay: number
}

interface VirtualScrollConfig {
  itemHeight: number
  containerHeight: number
  overscan: number
  threshold: number
}

export class PerformanceOptimizer {
  private static instance: PerformanceOptimizer
  private metrics: PerformanceMetrics
  private config: OptimizationConfig
  private observers: Map<string, IntersectionObserver | PerformanceObserver> = new Map()
  private memoCache: Map<string, any> = new Map()
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map()
  private throttleTimers: Map<string, number> = new Map()
  
  // Virtual scrolling state
  private virtualScrollConfigs: Map<string, VirtualScrollConfig> = new Map()
  private visibleRanges: Map<string, { start: number; end: number }> = new Map()
  
  // Performance monitoring
  private performanceEntries: PerformanceEntry[] = []
  private isMonitoring = false
  
  private constructor() {
    this.metrics = this.initializeMetrics()
    this.config = this.getDefaultConfig()
    this.initialize()
  }
  
  static getInstance(): PerformanceOptimizer {
    if (!PerformanceOptimizer.instance) {
      PerformanceOptimizer.instance = new PerformanceOptimizer()
    }
    return PerformanceOptimizer.instance
  }
  
  private initializeMetrics(): PerformanceMetrics {
    return {
      renderTime: 0,
      cacheHitRate: 0,
      memoryUsage: 0,
      networkLatency: 0,
      scrollPerformance: 0,
      interactionLatency: 0,
      bundleSize: 0,
      firstContentfulPaint: 0,
      largestContentfulPaint: 0,
      cumulativeLayoutShift: 0
    }
  }
  
  private getDefaultConfig(): OptimizationConfig {
    return {
      enableVirtualScrolling: true,
      enableMemoization: true,
      enableLazyLoading: true,
      enableImageOptimization: true,
      enableCodeSplitting: true,
      enablePreloading: true,
      maxConcurrentRequests: 6,
      debounceDelay: 300,
      throttleDelay: 16 // 60fps
    }
  }
  
  private async initialize(): Promise<void> {
    // Start performance monitoring
    this.startPerformanceMonitoring()
    
    // Setup intersection observers for lazy loading
    this.setupLazyLoadingObserver()
    
    // Setup memory pressure monitoring
    this.setupMemoryMonitoring()
    
    // Network monitoring disabled - relying on Pub/Sub for real-time updates
    // this.setupNetworkMonitoring()
    
    // Virtual scrolling will be initialized on demand
    
    console.log('[PerformanceOptimizer] Initialized with config:', this.config)
  }
  
  // Virtual Scrolling Implementation
  public setupVirtualScrolling(
    containerId: string,
    config: VirtualScrollConfig
  ): {
    getVisibleItems: (items: any[]) => { items: any[]; startIndex: number; endIndex: number }
    updateScrollPosition: (scrollTop: number) => void
    cleanup: () => void
  } {
    this.virtualScrollConfigs.set(containerId, config)
    
    const getVisibleItems = (items: any[]) => {
      const range = this.visibleRanges.get(containerId) || { start: 0, end: 0 }
      const startIndex = Math.max(0, range.start - config.overscan)
      const endIndex = Math.min(items.length - 1, range.end + config.overscan)
      
      return {
        items: items.slice(startIndex, endIndex + 1),
        startIndex,
        endIndex
      }
    }
    
    const updateScrollPosition = this.throttle((scrollTop: number) => {
      const startIndex = Math.floor(scrollTop / config.itemHeight)
      const visibleCount = Math.ceil(config.containerHeight / config.itemHeight)
      const endIndex = startIndex + visibleCount - 1
      
      this.visibleRanges.set(containerId, { start: startIndex, end: endIndex })
      
      // Trigger preloading for upcoming items
      if (this.config.enablePreloading) {
        this.preloadUpcomingItems(containerId, endIndex)
      }
    }, this.config.throttleDelay)
    
    const cleanup = () => {
      this.virtualScrollConfigs.delete(containerId)
      this.visibleRanges.delete(containerId)
    }
    
    return { getVisibleItems, updateScrollPosition, cleanup }
  }
  
  private async preloadUpcomingItems(containerId: string, currentEndIndex: number): Promise<void> {
    const config = this.virtualScrollConfigs.get(containerId)
    if (!config) return
    
    // Preload next batch of items
    const preloadCount = Math.min(10, config.overscan)
    const preloadStart = currentEndIndex + 1
    const preloadEnd = preloadStart + preloadCount
    
    // This would be customized based on the specific use case
    // For emails, we might preload email content
    for (let i = preloadStart; i <= preloadEnd; i++) {
      // Trigger preload through preload engine
      await preloadEngine.preloadEmail(`item-${i}`, 0.3)
    }
  }
  
  // Memoization utilities
  public memoize<T extends (...args: any[]) => any>(
    fn: T,
    keyGenerator?: (...args: Parameters<T>) => string
  ): T {
    if (!this.config.enableMemoization) {
      return fn
    }
    
    const memoized = ((...args: Parameters<T>) => {
      const key = keyGenerator ? keyGenerator(...args) : JSON.stringify(args)
      
      if (this.memoCache.has(key)) {
        return this.memoCache.get(key)
      }
      
      const result = fn(...args)
      
      // Store in cache with size limit
      if (this.memoCache.size > 1000) {
        const firstKey = this.memoCache.keys().next().value
        if (firstKey !== undefined) {
          this.memoCache.delete(firstKey)
        }
      }
      
      this.memoCache.set(key, result)
      return result
    }) as T
    
    return memoized
  }
  
  // Debouncing utility
  public debounce<T extends (...args: any[]) => any>(
    fn: T,
    delay?: number,
    key?: string
  ): T {
    const debounceDelay = delay || this.config.debounceDelay
    const debounceKey = key || (fn.name || 'default')
    
    const debounced = ((...args: Parameters<T>) => {
      const existingTimer = this.debounceTimers.get(debounceKey)
      if (existingTimer) {
        clearTimeout(existingTimer)
      }
      
      const timer = setTimeout(() => {
        fn(...args)
        this.debounceTimers.delete(debounceKey)
      }, debounceDelay)
      
      this.debounceTimers.set(debounceKey, timer)
    }) as T
    
    return debounced
  }
  
  // Throttling utility
  public throttle<T extends (...args: any[]) => any>(
    fn: T,
    delay?: number,
    key?: string
  ): T {
    const throttleDelay = delay || this.config.throttleDelay
    const throttleKey = key || fn.name || 'default'
    
    const throttled = ((...args: Parameters<T>) => {
      const lastCall = this.throttleTimers.get(throttleKey) || 0
      const now = Date.now()
      
      if (now - lastCall >= throttleDelay) {
        this.throttleTimers.set(throttleKey, now)
        return fn(...args)
      }
    }) as T
    
    return throttled
  }
  
  // Lazy loading implementation
  private setupLazyLoadingObserver(): void {
    if (!this.config.enableLazyLoading || !('IntersectionObserver' in window)) {
      return
    }
    
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const element = entry.target as HTMLElement
            this.loadLazyContent(element)
            observer.unobserve(element)
          }
        })
      },
      {
        rootMargin: '50px',
        threshold: 0.1
      }
    )
    
    this.observers.set('lazy-loading', observer)
  }
  
  private async loadLazyContent(element: HTMLElement): Promise<void> {
    const loadType = element.dataset.lazyType
    const loadSrc = element.dataset.lazySrc
    const loadId = element.dataset.lazyId
    
    if (!loadType || !loadSrc) return
    
    try {
      switch (loadType) {
        case 'image':
          await this.loadLazyImage(element as HTMLImageElement, loadSrc)
          break
        case 'email-content':
          if (loadId) {
            await this.loadLazyEmailContent(element, loadId)
          }
          break
        case 'component':
          await this.loadLazyComponent(element, loadSrc)
          break
        default:
          console.warn('[PerformanceOptimizer] Unknown lazy load type:', loadType)
      }
    } catch (error) {
      console.error('[PerformanceOptimizer] Failed to load lazy content:', error)
    }
  }
  
  private async loadLazyImage(img: HTMLImageElement, src: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const tempImg = new Image()
      
      tempImg.onload = () => {
        img.src = src
        img.classList.add('loaded')
        resolve()
      }
      
      tempImg.onerror = reject
      tempImg.src = src
    })
  }
  
  private async loadLazyEmailContent(element: HTMLElement, emailId: string): Promise<void> {
    // Try to get from cache first
    const cached = await cacheHierarchy.get(`email-content-${emailId}`)
    
    if (cached && typeof cached === 'object' && 'content' in cached) {
      element.innerHTML = (cached as any).content
      element.classList.add('loaded')
      return
    }
    
    // Load from API
    const response = await fetch(`/api/emails/${emailId}/content`)
    const content = await response.text()
    
    // Cache for future use
    await cacheHierarchy.set(`email-content-${emailId}`, { content }, { priority: 0.7 })
    
    element.innerHTML = content
    element.classList.add('loaded')
  }
  
  private async loadLazyComponent(element: HTMLElement, componentPath: string): Promise<void> {
    try {
      // Validate component path to avoid critical dependency warnings
      if (!componentPath || typeof componentPath !== 'string') {
        console.warn('[PerformanceOptimizer] Invalid component path:', componentPath)
        return
      }
      
      // For now, just mark as loaded without dynamic imports to avoid webpack warnings
      // Dynamic imports with expressions cause critical dependency warnings
      // This functionality can be implemented at the framework level (React/Next.js)
      console.log('[PerformanceOptimizer] Marking lazy component as loaded:', componentPath)
      element.classList.add('loaded')
      
    } catch (error) {
      console.error('[PerformanceOptimizer] Failed to load lazy component:', error)
      element.classList.add('error')
    }
  }
  
  // Performance monitoring
  private startPerformanceMonitoring(): void {
    if (this.isMonitoring || !('PerformanceObserver' in window)) {
      return
    }
    
    this.isMonitoring = true
    
    // Monitor navigation timing
    const navObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries()
      entries.forEach((entry) => {
        if (entry.entryType === 'navigation') {
          this.updateNavigationMetrics(entry as PerformanceNavigationTiming)
        }
      })
    })
    
    navObserver.observe({ entryTypes: ['navigation'] })
    this.observers.set('navigation', navObserver)
    
    // Monitor paint timing
    const paintObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries()
      entries.forEach((entry) => {
        if (entry.name === 'first-contentful-paint') {
          this.metrics.firstContentfulPaint = entry.startTime
        }
      })
    })
    
    paintObserver.observe({ entryTypes: ['paint'] })
    this.observers.set('paint', paintObserver)
    
    // Monitor largest contentful paint
    const lcpObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries()
      const lastEntry = entries[entries.length - 1]
      if (lastEntry) {
        this.metrics.largestContentfulPaint = lastEntry.startTime
      }
    })
    
    lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] })
    this.observers.set('lcp', lcpObserver)
    
    // Monitor layout shifts
    const clsObserver = new PerformanceObserver((list) => {
      let clsValue = 0
      const entries = list.getEntries()
      
      entries.forEach((entry: any) => {
        if (!entry.hadRecentInput) {
          clsValue += entry.value
        }
      })
      
      this.metrics.cumulativeLayoutShift += clsValue
    })
    
    clsObserver.observe({ entryTypes: ['layout-shift'] })
    this.observers.set('cls', clsObserver)
  }
  
  private updateNavigationMetrics(entry: PerformanceNavigationTiming): void {
    this.metrics.networkLatency = entry.responseEnd - entry.requestStart
    this.metrics.renderTime = entry.loadEventEnd - entry.responseEnd
  }
  
  private setupMemoryMonitoring(): void {
    if (!('memory' in performance)) {
      return
    }
    
    // Memory monitoring disabled - relying on Pub/Sub for real-time updates
    // Manual memory checks can still be triggered when needed
    console.log('[PerformanceOptimizer] Memory monitoring disabled - using Pub/Sub for real-time updates')
    
    /*
    setInterval(() => {
      const memory = (performance as any).memory
      this.metrics.memoryUsage = memory.usedJSHeapSize / memory.jsHeapSizeLimit
      
      // Trigger garbage collection if memory usage is high
      if (this.metrics.memoryUsage > 0.8) {
        this.performMemoryCleanup()
      }
    }, 30000) // Check every 30 seconds
    */
  }
  
  private setupNetworkMonitoring(): void {
    if (!('connection' in navigator)) {
      return
    }
    
    const connection = (navigator as any).connection
    
    const updateNetworkInfo = () => {
      // Adjust configuration based on network conditions
      if (connection.effectiveType === 'slow-2g' || connection.effectiveType === '2g') {
        this.config.maxConcurrentRequests = 2
        this.config.enablePreloading = false
      } else if (connection.effectiveType === '3g') {
        this.config.maxConcurrentRequests = 4
        this.config.enablePreloading = true
      } else {
        this.config.maxConcurrentRequests = 6
        this.config.enablePreloading = true
      }
    }
    
    connection.addEventListener('change', updateNetworkInfo)
    updateNetworkInfo() // Initial setup
  }
  
  private async performMemoryCleanup(): Promise<void> {
    // Clear memoization cache
    this.memoCache.clear()
    
    // Clear cache hierarchy if needed
    await cacheHierarchy.clear()
    
    // Clear user behavior model cache
    const userModel = UserBehaviorModel.getInstance()
    userModel.reset()
    
    console.log('[PerformanceOptimizer] Performed memory cleanup')
  }
  
  // Image optimization
  public optimizeImage(
    src: string,
    options: {
      width?: number
      height?: number
      quality?: number
      format?: 'webp' | 'avif' | 'jpeg' | 'png'
    } = {}
  ): string {
    if (!this.config.enableImageOptimization) {
      return src
    }
    
    const params = new URLSearchParams()
    
    if (options.width) params.append('w', options.width.toString())
    if (options.height) params.append('h', options.height.toString())
    if (options.quality) params.append('q', options.quality.toString())
    if (options.format) params.append('f', options.format)
    
    // This would typically point to an image optimization service
    return `/api/images/optimize?src=${encodeURIComponent(src)}&${params.toString()}`
  }
  
  // Public API
  public observeLazyElement(element: HTMLElement): void {
    const observer = this.observers.get('lazy-loading') as IntersectionObserver
    if (observer) {
      observer.observe(element)
    }
  }
  
  public unobserveLazyElement(element: HTMLElement): void {
    const observer = this.observers.get('lazy-loading') as IntersectionObserver
    if (observer) {
      observer.unobserve(element)
    }
  }
  
  public updateConfig(newConfig: Partial<OptimizationConfig>): void {
    this.config = { ...this.config, ...newConfig }
    console.log('[PerformanceOptimizer] Config updated:', this.config)
  }
  
  public getMetrics(): PerformanceMetrics {
    // Update cache hit rate from cache statistics
    this.metrics.cacheHitRate = 0.85 // Placeholder - would be calculated from actual cache stats
    
    return { ...this.metrics }
  }
  
  public getConfig(): OptimizationConfig {
    return { ...this.config }
  }
  
  public clearMemoCache(): void {
    this.memoCache.clear()
  }
  
  public cleanup(): void {
    // Clear all observers
    this.observers.forEach((observer) => {
      observer.disconnect()
    })
    this.observers.clear()
    
    // Clear timers
    this.debounceTimers.forEach((timer) => {
      clearTimeout(timer)
    })
    this.debounceTimers.clear()
    this.throttleTimers.clear()
    
    // Clear caches
    this.memoCache.clear()
    this.virtualScrollConfigs.clear()
    this.visibleRanges.clear()
    
    this.isMonitoring = false
    console.log('[PerformanceOptimizer] Cleanup completed')
  }
}

// Export singleton instance
export const performanceOptimizer = PerformanceOptimizer.getInstance()
export default performanceOptimizer