import { NextRequest, NextResponse } from 'next/server';
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

const execAsync = promisify(exec);

export async function POST(request: NextRequest) {
  try {
    // Get authenticated user and tenant_id
    const supabase = getSupabaseServerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized: User not authenticated' },
        { status: 401 }
      );
    }

    // Get tenant_id from user's account
    const { data: accountData, error: accountError } = await supabase
      .from('accounts')
      .select('id')
      .eq('id', user.id)
      .single();

    if (accountError || !accountData) {
      return NextResponse.json(
        { success: false, message: 'Failed to retrieve tenant ID' },
        { status: 400 }
      );
    }

    const tenantId = accountData.id;

    // Parse multipart form data
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { success: false, message: 'No file uploaded' },
        { status: 400 }
      );
    }

    // Validate file type
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      return NextResponse.json(
        { success: false, message: 'Invalid file type. Please upload .xlsx or .xls file' },
        { status: 400 }
      );
    }

    // Save file to temporary location
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    
    const tmpDir = process.env.TEMP || process.env.TMP || '/tmp';
    const timestamp = Date.now();
    const tmpFilePath = join(tmpDir, `upload_${timestamp}_${file.name}`);

    await writeFile(tmpFilePath, buffer);

    console.log(`📁 File saved to: ${tmpFilePath}`);

    // Determine Python executable path
    const isWindows = process.platform === 'win32';
    const pythonPath = isWindows
      ? join(process.cwd(), '..', '..', 'backend', 'venv', 'Scripts', 'python.exe')
      : join(process.cwd(), '..', '..', 'backend', 'venv', 'bin', 'python');

    const scriptPath = join(process.cwd(), '..', '..', 'backend', 'scripts', 'import_maintenance.py');

    // Execute Python ETL script
    const command = `"${pythonPath}" "${scriptPath}" --file "${tmpFilePath}" --tenant-id "${tenantId}"`;

    console.log(`🐍 Executing: ${command}`);

    try {
      const { stdout, stderr } = await execAsync(command, {
        timeout: 60000, // 60 seconds timeout
        env: {
          ...process.env,
          NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
          SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
        },
      });

      console.log('✅ ETL stdout:', stdout);
      if (stderr) {
        console.warn('⚠️  ETL stderr:', stderr);
      }

      // Parse JSON output from Python script
      const lines = stdout.trim().split('\n');
      const lastLine = lines[lines.length - 1];
      
      let result;
      try {
        result = lastLine ? JSON.parse(lastLine) : null;
      } catch (parseError) {
        // If last line is not JSON, try to find JSON in output
        const jsonPattern = /\{[^{}]*"success"[^{}]*\}/;
        const jsonMatch = stdout.match(jsonPattern);
        if (jsonMatch) {
          result = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('Failed to parse ETL script output');
        }
      }

      // Clean up temporary file
      await unlink(tmpFilePath).catch(err => 
        console.warn(`Failed to delete temp file: ${err}`)
      );

      if (result.success) {
        return NextResponse.json(result, { status: 200 });
      } else {
        return NextResponse.json(result, { status: 400 });
      }

    } catch (execError: any) {
      console.error('❌ ETL execution error:', execError);
      
      // Clean up temporary file
      await unlink(tmpFilePath).catch(err => 
        console.warn(`Failed to delete temp file: ${err}`)
      );

      return NextResponse.json(
        {
          success: false,
          message: `ETL script failed: ${execError.message}`,
        },
        { status: 500 }
      );
    }

  } catch (error: any) {
    console.error('❌ Upload API error:', error);
    
    return NextResponse.json(
      {
        success: false,
        message: `Server error: ${error.message}`,
      },
      { status: 500 }
    );
  }
}

// Handle OPTIONS for CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Allow': 'POST, OPTIONS',
    },
  });
}
