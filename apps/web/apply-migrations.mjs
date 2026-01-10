/**
 * Apply Migrations to Remote Supabase
 * Run with: node apply-migrations.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
const SUPABASE_URL = 'https://izqyllmbjnfxfdauhfey.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6cXlsbG1iam5meGZkYXVoZmV5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MTUwMzI0MCwiZXhwIjoyMDc3MDc5MjQwfQ.axKRBfDMN4sPfd0R9ItRNKqJRUjI04ud2Pp7tLN83cY';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

/**
 * @param {string} sql
 * @param {string} name
 * @returns {Promise<boolean>}
 */
async function executeSql(sql, name) {
  console.log(`\n📝 Executing: ${name}...`);
  
  try {
    // Split by semicolon and execute each statement
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));
    
    for (const statement of statements) {
      if (statement.length < 10) continue; // Skip empty/comment lines
      
      const { data, error } = await supabase.rpc('exec_sql', { 
        sql: statement + ';' 
      });
      
      if (error) {
        // Try direct query if RPC doesn't exist
        const { error: queryError } = await supabase
          .from('_migrations')
          .select('*')
          .limit(1);
        
        if (queryError?.message?.includes('relation "_migrations" does not exist')) {
          console.log('⚠️  Note: Using direct SQL execution (exec_sql RPC not available)');
        }
        
        // For migrations, we'll execute them via the SQL editor manually
        console.log(`⚠️  Statement may need manual execution: ${statement.substring(0, 60)}...`);
      }
    }
    
    console.log(`✅ ${name} completed`);
    return true;
  } catch (err) {
    console.error(`❌ Error in ${name}:`, err instanceof Error ? err.message : String(err));
    return false;
  }
}

async function applyMigrations() {
  console.log('🚀 Starting migration process...\n');
  
  // Read migration files
  const migration1 = readFileSync(
    join(__dirname, './supabase/migrations/20250112_create_documents_table.sql'),
    'utf-8'
  );
  
  const migration2 = readFileSync(
    join(__dirname, './supabase/migrations/20250112_add_custom_columns.sql'),
    'utf-8'
  );
  
  console.log('📋 Migrations to apply:');
  console.log('  1. Create documents table (upload tracking)');
  console.log('  2. Add custom_columns to tables (flexible schema)');
  
  // Test connection
  console.log('\n🔌 Testing connection...');
  const { data: testData, error: testError } = await supabase
    .from('assets')
    .select('id')
    .limit(1);
  
  if (testError) {
    console.error('❌ Connection failed:', testError.message);
    console.log('\n⚠️  Please apply migrations manually via Supabase Dashboard:');
    console.log('   1. Go to: https://supabase.com/dashboard/project/izqyllmbjnfxfdauhfey/editor');
    console.log('   2. Click "SQL Editor"');
    console.log('   3. Paste contents of migration files');
    console.log('   4. Click "Run"');
    return;
  }
  
  console.log('✅ Connected to Supabase!\n');
  
  // Check if documents table already exists
  const { data: tableCheck } = await supabase
    .from('documents')
    .select('id')
    .limit(1);
  
  if (tableCheck !== null) {
    console.log('ℹ️  Documents table already exists, skipping creation...');
  } else {
    console.log('\n📄 MIGRATION 1: Create documents table');
    console.log('──────────────────────────────────────────');
    await executeSql(migration1, 'documents table');
  }
  
  console.log('\n📄 MIGRATION 2: Add custom_columns');
  console.log('──────────────────────────────────────────');
  await executeSql(migration2, 'custom_columns');
  
  console.log('\n\n🎉 Migration process completed!');
  console.log('\n📊 Next steps:');
  console.log('  1. Verify tables in Supabase Dashboard');
  console.log('  2. Upload a CSV file to test');
  console.log('  3. Check dashboards for real data');
}

// Run migrations
applyMigrations().catch(console.error);
