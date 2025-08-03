'use client'

import { useSession, signIn } from 'next-auth/react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Mail, Sparkles, Brain, Zap, Shield, Clock } from 'lucide-react'
import { EmailDashboard } from '@/components/email-dashboard'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function HomePage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  useEffect(() => {
    // If user is authenticated, they should see the dashboard
    if (status === 'authenticated' && session) {
      // Optional: You could redirect to a dedicated dashboard route
      // router.push('/dashboard')
    }
  }, [status, session, router])

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (session) {
    return <EmailDashboard />
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-white via-blue-50 to-indigo-100 dark:from-gray-900 dark:via-blue-900 dark:to-indigo-900">
      {/* Hero Section */}
      <div className="container mx-auto px-6 py-20">
        <div className="text-center max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="mb-8"
          >
            <div className="flex items-center justify-center mb-6">
              <div className="bg-primary/10 p-3 rounded-full">
                <Mail className="h-8 w-8 text-primary" />
              </div>
            </div>
            <h1 className="text-5xl md:text-6xl font-bold tracking-tight text-gray-900 dark:text-white mb-6">
              InSyte
              <span className="text-primary"> AI</span>
            </h1>
            <p className="text-xl text-gray-600 dark:text-gray-300 mb-8 max-w-2xl mx-auto">
              Transform your email experience with AI-powered summaries, intelligent replies, voice assistance, and web search. 
              The future of email management and information access is here.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.6 }}
            className="mb-12"
          >
            <Button 
              size="lg" 
              onClick={() => signIn('google', { callbackUrl: '/' })}
              className="bg-primary hover:bg-primary/90 text-white px-8 py-4 text-lg font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-300"
            >
              <Sparkles className="mr-2 h-5 w-5" /> 
              Get Started with Google
            </Button>
          </motion.div>
        </div>

        {/* Features Grid */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.6 }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto"
        >
          <Card className="group hover:shadow-xl transition-all duration-300 border-0 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm">
            <CardHeader className="text-center">
              <div className="mx-auto bg-blue-100 dark:bg-blue-900/30 p-3 rounded-full w-fit mb-4 group-hover:scale-110 transition-transform duration-300">
                <Brain className="h-8 w-8 text-blue-600 dark:text-blue-400" />
              </div>
              <CardTitle className="text-xl font-semibold">AI Email Summaries</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-center">
                Get instant, intelligent summaries of your emails. Understand the key points without reading every word.
              </CardDescription>
            </CardContent>
          </Card>

          <Card className="group hover:shadow-xl transition-all duration-300 border-0 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm">
            <CardHeader className="text-center">
              <div className="mx-auto bg-green-100 dark:bg-green-900/30 p-3 rounded-full w-fit mb-4 group-hover:scale-110 transition-transform duration-300">
                <Zap className="h-8 w-8 text-green-600 dark:text-green-400" />
              </div>
              <CardTitle className="text-xl font-semibold">Smart Replies</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-center">
                AI-generated reply suggestions based on context and tone. Respond faster with personalized options.
              </CardDescription>
            </CardContent>
          </Card>

          <Card className="group hover:shadow-xl transition-all duration-300 border-0 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm">
            <CardHeader className="text-center">
              <div className="mx-auto bg-purple-100 dark:bg-purple-900/30 p-3 rounded-full w-fit mb-4 group-hover:scale-110 transition-transform duration-300">
                <Shield className="h-8 w-8 text-purple-600 dark:text-purple-400" />
              </div>
              <CardTitle className="text-xl font-semibold">Smart Filters</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-center">
                Automatically categorize emails by importance, spam detection, and priority levels using advanced AI.
              </CardDescription>
            </CardContent>
          </Card>

          <Card className="group hover:shadow-xl transition-all duration-300 border-0 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm">
            <CardHeader className="text-center">
              <div className="mx-auto bg-orange-100 dark:bg-orange-900/30 p-3 rounded-full w-fit mb-4 group-hover:scale-110 transition-transform duration-300">
                <Clock className="h-8 w-8 text-orange-600 dark:text-orange-400" />
              </div>
              <CardTitle className="text-xl font-semibold">Voice Assistant</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-center">
                Listen to email summaries and compose replies using natural voice commands powered by ElevenLabs.
              </CardDescription>
            </CardContent>
          </Card>

          <Card className="group hover:shadow-xl transition-all duration-300 border-0 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm">
            <CardHeader className="text-center">
              <div className="mx-auto bg-red-100 dark:bg-red-900/30 p-3 rounded-full w-fit mb-4 group-hover:scale-110 transition-transform duration-300">
                <Sparkles className="h-8 w-8 text-red-600 dark:text-red-400" />
              </div>
              <CardTitle className="text-xl font-semibold">AI Compose</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-center">
                Draft professional emails with AI assistance. Grammar checking and tone optimization included.
              </CardDescription>
            </CardContent>
          </Card>

          <Card className="group hover:shadow-xl transition-all duration-300 border-0 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm">
            <CardHeader className="text-center">
              <div className="mx-auto bg-indigo-100 dark:bg-indigo-900/30 p-3 rounded-full w-fit mb-4 group-hover:scale-110 transition-transform duration-300">
                <Mail className="h-8 w-8 text-indigo-600 dark:text-indigo-400" />
              </div>
              <CardTitle className="text-xl font-semibold">Modern Interface</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-center">
                Beautiful, intuitive design that makes email management a pleasure. Dark mode and customization included.
              </CardDescription>
            </CardContent>
          </Card>
        </motion.div>

        {/* CTA Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.6 }}
          className="text-center mt-20"
        >
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
            Ready to revolutionize your email?
          </h2>
          <p className="text-lg text-gray-600 dark:text-gray-300 mb-8">
            Join thousands of users who have transformed their email experience with InSyte AI.
          </p>
          <Button 
            size="lg" 
            onClick={() => signIn('google', { callbackUrl: '/' })}
            className="bg-primary hover:bg-primary/90 text-white px-8 py-4 text-lg font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-300"
          >
            Start Free Today
          </Button>
        </motion.div>
      </div>
    </main>
  )
}