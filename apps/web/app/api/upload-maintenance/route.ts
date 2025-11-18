import { NextRequest, NextResponse } from 'next/server';
import { writeFile, unlink } from 'fs/promises';
import { existsSync } from 'fs';
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

    // Validate file type (now supports CSV and JSON too)
    const validExtensions = ['.xlsx', '.xls', '.csv', '.json'];
    const fileExtension = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    
    if (!validExtensions.includes(fileExtension)) {
      return NextResponse.json(
        { success: false, message: `Invalid file type. Supported formats: ${validExtensions.join(', ')}` },
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

    // Detect import type based on filename patterns
    let scriptName = 'import_maintenance.py'; // default
    let needsKpiCalculation = false; // Flag to trigger KPI calculation after import
    const fileNameLower = file.name.toLowerCase();
    
    if (fileNameLower.includes('kpi') || 
        fileNameLower.includes('mtbf') || 
        fileNameLower.includes('mttr') || 
        fileNameLower.includes('dispo') ||
        fileNameLower.includes('availability')) {
      scriptName = 'import_kpis.py';
      console.log('📊 Detected KPI data file');
    } else if (fileNameLower.includes('amdec') || 
               fileNameLower.includes('fmea') || 
               fileNameLower.includes('failure')) {
      // Use specialized importer that handles maintenance-style AMDEC files
      scriptName = 'import_amdec_from_maintenance.py';
      console.log('🔧 Detected AMDEC/FMEA data file (maintenance-style)');
    } else {
      console.log('📋 Using maintenance work orders importer');
      needsKpiCalculation = true; // Maintenance data requires KPI calculation
    }

    const scriptPath = join(process.cwd(), '..', '..', 'backend', 'scripts', scriptName);

    // Verify file exists before executing
    if (!existsSync(tmpFilePath)) {
      return NextResponse.json(
        { success: false, message: `Temp file not found: ${tmpFilePath}` },
        { status: 500 }
      );
    }

    console.log(`✅ File verified at: ${tmpFilePath}`);

    // Execute Python ETL script with properly escaped paths for Windows
    const command = isWindows
      ? `"${pythonPath}" "${scriptPath}" --file "${tmpFilePath}" --tenant-id "${tenantId}"`
      : `"${pythonPath}" "${scriptPath}" --file "${tmpFilePath}" --tenant-id "${tenantId}"`;

    console.log(`🐍 Executing: ${command}`);

    try {
      const { stdout, stderr } = await execAsync(command, {
        timeout: 600000, // 600 seconds (10 min) timeout for very large imports
        maxBuffer: 1024 * 1024 * 30, // 30MB buffer to accommodate batched logs
        env: {
          ...process.env,
          NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
          SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
        },
        cwd: join(process.cwd(), '..', '..', 'backend'), // Set working directory
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
          // Return full stdout for debugging
          console.error('Failed to parse JSON, full output:', stdout);
          throw new Error('Failed to parse ETL script output');
        }
      }

      // Clean up temporary file
      await unlink(tmpFilePath).catch(err => 
        console.warn(`Failed to delete temp file: ${err}`)
      );

      if (result && result.success) {
        // If this was maintenance data, automatically calculate KPIs
        if (needsKpiCalculation) {
          console.log('🔄 Starting automatic KPI calculation...');
          
          const kpiScriptPath = join(process.cwd(), '..', '..', 'backend', 'scripts', 'calculate_kpis.py');
          const kpiCommand = isWindows
            ? `"${pythonPath}" "${kpiScriptPath}" --tenant-id "${tenantId}"`
            : `"${pythonPath}" "${kpiScriptPath}" --tenant-id "${tenantId}"`;

          console.log(`📊 Executing: ${kpiCommand}`);

          try {
            const { stdout: kpiStdout, stderr: kpiStderr } = await execAsync(kpiCommand, {
              timeout: 600000, // 10 min timeout for KPI recalculation on large datasets
              maxBuffer: 1024 * 1024 * 30, // 30MB buffer
              env: {
                ...process.env,
                NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
                SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
              },
              cwd: join(process.cwd(), '..', '..', 'backend'), // Set working directory
            });

            console.log('✅ KPI calculation stdout:', kpiStdout);
            if (kpiStderr) {
              console.warn('⚠️  KPI calculation stderr:', kpiStderr);
            }

            // Parse KPI calculation result
            const kpiLines = kpiStdout.trim().split('\n');
            const kpiLastLine = kpiLines[kpiLines.length - 1];
            
            let kpiResult;
            try {
              kpiResult = kpiLastLine ? JSON.parse(kpiLastLine) : null;
            } catch (parseError) {
              // Try to find JSON in output
              const jsonPattern = /\{[^{}]*"success"[^{}]*\}/;
              const jsonMatch = kpiStdout.match(jsonPattern);
              if (jsonMatch) {
                kpiResult = JSON.parse(jsonMatch[0]);
              }
            }

            // Combine results
            return NextResponse.json({
              ...result,
              kpi_calculation: kpiResult || { success: true, message: 'KPI calculation completed' }
            }, { status: 200 });

          } catch (kpiError: any) {
            console.error('⚠️  KPI calculation failed (non-fatal):', kpiError);
            console.error('KPI stdout:', kpiError.stdout || 'N/A');
            console.error('KPI stderr:', kpiError.stderr || 'N/A');
            
            // Don't fail the whole request if KPI calculation fails
            return NextResponse.json({
              ...result,
              kpi_calculation: {
                success: false,
                message: `KPI calculation failed: ${kpiError.message}`,
                warning: 'Data was imported successfully, but KPI calculation failed. You may need to run it manually.'
              }
            }, { status: 200 });
          }
        }

        return NextResponse.json(result, { status: 200 });
      } else {
        return NextResponse.json(result || { success: false, message: 'Unknown error' }, { status: 400 });
      }

    } catch (execError: any) {
      console.error('❌ ETL execution error:', execError);
      console.error('Command was:', command);
      console.error('Stdout:', execError.stdout || 'N/A');
      console.error('Stderr:', execError.stderr || 'N/A');
      
      // Clean up temporary file
      await unlink(tmpFilePath).catch(err => 
        console.warn(`Failed to delete temp file: ${err}`)
      );

      return NextResponse.json(
        {
          success: false,
          message: `ETL script failed: ${execError.message}`,
          details: {
            stdout: execError.stdout || '',
            stderr: execError.stderr || '',
          }
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
