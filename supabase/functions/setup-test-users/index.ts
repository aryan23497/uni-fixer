import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

Deno.serve(async (req) => {
  try {
    // Create a Supabase client with the service role key for admin operations
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Get departments first
    const { data: departments } = await supabaseAdmin
      .from('departments')
      .select('*');

    if (!departments || departments.length === 0) {
      throw new Error('No departments found. Please add departments first.');
    }

    const csDept = departments.find(d => d.code === 'CS');
    
    const testUsers = [
      {
        email: 'student@bitdurg.ac.in',
        password: 'password123',
        role: 'student',
        userData: {
          college_id: 'STU001',
          full_name: 'Test Student',
          email: 'student@bitdurg.ac.in'
        },
        departmentId: csDept?.id
      },
      {
        email: 'principal@bitdurg.ac.in',
        password: 'password123',
        role: 'principal',
        userData: {
          college_id: 'PRIN001',
          full_name: 'Test Principal',
          email: 'principal@bitdurg.ac.in'
        },
        departmentId: null
      },
      {
        email: 'hod@bitdurg.ac.in',
        password: 'password123',
        role: 'hod',
        userData: {
          college_id: 'HOD001',
          full_name: 'HOD Computer Science',
          email: 'hod@bitdurg.ac.in'
        },
        departmentId: csDept?.id
      }
    ];

    const results = [];

    for (const testUser of testUsers) {
      // Create user
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: testUser.email,
        password: testUser.password,
        email_confirm: true,
        user_metadata: testUser.userData
      });

      if (authError) {
        console.error(`Error creating user ${testUser.email}:`, authError);
        results.push({ email: testUser.email, status: 'error', error: authError.message });
        continue;
      }

      if (!authData.user) {
        results.push({ email: testUser.email, status: 'error', error: 'No user returned' });
        continue;
      }

      // Update profile with department if needed
      if (testUser.departmentId) {
        const { error: profileError } = await supabaseAdmin
          .from('profiles')
          .update({ department_id: testUser.departmentId })
          .eq('id', authData.user.id);

        if (profileError) {
          console.error(`Error updating profile for ${testUser.email}:`, profileError);
        }
      }

      // Insert user role
      const { error: roleError } = await supabaseAdmin
        .from('user_roles')
        .insert({
          user_id: authData.user.id,
          role: testUser.role
        });

      if (roleError) {
        console.error(`Error assigning role for ${testUser.email}:`, roleError);
        results.push({ 
          email: testUser.email, 
          status: 'partial', 
          message: 'User created but role assignment failed',
          error: roleError.message 
        });
      } else {
        results.push({ 
          email: testUser.email, 
          status: 'success', 
          role: testUser.role,
          userId: authData.user.id
        });
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Test users setup completed',
        results 
      }),
      { 
        headers: { 'Content-Type': 'application/json' },
        status: 200 
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      }),
      { 
        headers: { 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
