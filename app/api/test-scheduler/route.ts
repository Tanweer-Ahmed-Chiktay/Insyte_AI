import { NextRequest, NextResponse } from 'next/server'
import { emailScheduler } from '@/lib/email-scheduler-service'

export async function GET(request: NextRequest) {
  try {
    console.log('🔍 Testing Email Scheduler Status');
    
    // Check if scheduler is initialized
    const activeJobs = emailScheduler.getActiveJobs();
    const jobCount = emailScheduler.getJobCount();
    
    console.log('📊 Scheduler Status:');
    console.log(`- Job count: ${jobCount}`);
    console.log(`- Active jobs: ${activeJobs.join(', ') || 'None'}`);
    
    let initializationResult = null;
    
    if (jobCount === 0) {
      console.log('⚠️  No active jobs found. Initializing scheduler...');
      await emailScheduler.initialize();
      
      const newActiveJobs = emailScheduler.getActiveJobs();
      const newJobCount = emailScheduler.getJobCount();
      
      console.log('📊 After initialization:');
      console.log(`- Job count: ${newJobCount}`);
      console.log(`- Active jobs: ${newActiveJobs.join(', ') || 'None'}`);
      
      initializationResult = {
        jobCount: newJobCount,
        activeJobs: newActiveJobs
      };
    }
    
    return NextResponse.json({
      success: true,
      scheduler: {
        initialJobCount: jobCount,
        initialActiveJobs: activeJobs,
        afterInitialization: initializationResult
      },
      message: 'Scheduler test completed successfully'
    });
    
  } catch (error) {
    console.error('❌ Error testing scheduler:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
        message: 'Scheduler test failed'
      },
      { status: 500 }
    );
  }
}