import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useNavigate } from 'react-router-dom';
import { Header } from '@/components/Header';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Clock, MapPin, Calendar, User, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { format } from 'date-fns';

const HodDashboard = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [hasHodRole, setHasHodRole] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
      return;
    }

    // Check if user has HOD role
    if (user) {
      supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'hod')
        .single()
        .then(({ data }) => {
          if (!data) {
            toast({
              title: 'Access Denied',
              description: 'You do not have HOD access.',
              variant: 'destructive',
            });
            navigate('/');
          } else {
            setHasHodRole(true);
          }
        });
    }
  }, [user, loading, navigate, toast]);

  // Fetch HOD's department
  const { data: profile } = useQuery({
    queryKey: ['hod-profile', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('department_id, departments(name, code)')
        .eq('id', user?.id!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user && hasHodRole,
  });

  // Fetch department issues
  const { data: issues, refetch } = useQuery({
    queryKey: ['hod-issues', profile?.department_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('issues')
        .select(`
          *,
          profiles!issues_reporter_id_fkey(full_name, college_id),
          departments(name, code)
        `)
        .eq('department_id', profile?.department_id!)
        .order('reported_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
    enabled: !!profile?.department_id,
  });

  const handleStatusChange = async (issueId: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from('issues')
        .update({ 
          status: newStatus as 'pending' | 'acknowledged' | 'work_done',
          ...(newStatus === 'work_done' && { resolved_at: new Date().toISOString() })
        })
        .eq('id', issueId);

      if (error) throw error;

      toast({
        title: 'Status Updated',
        description: 'Issue status has been updated successfully.',
      });
      refetch();
    } catch (error: any) {
      toast({
        title: 'Update Failed',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const getStatusBadge = (status: string, isPriority: boolean) => {
    const variants: Record<string, any> = {
      pending: 'destructive',
      acknowledged: 'default',
      work_done: 'default',
    };

    const labels: Record<string, string> = {
      pending: 'Pending',
      acknowledged: 'Acknowledged',
      work_done: 'Resolved',
    };

    return (
      <div className="flex gap-2">
        <Badge variant={variants[status]}>{labels[status]}</Badge>
        {isPriority && <Badge variant="outline" className="border-destructive text-destructive">Priority</Badge>}
      </div>
    );
  };

  if (loading || !hasHodRole) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const stats = {
    total: issues?.length || 0,
    pending: issues?.filter(i => i.status === 'pending').length || 0,
    acknowledged: issues?.filter(i => i.status === 'acknowledged').length || 0,
    resolved: issues?.filter(i => i.status === 'work_done').length || 0,
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary to-background">
      <Header />
      
      <div className="container py-8 px-4">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">HOD Dashboard</h1>
          <p className="text-muted-foreground">
            Department: {profile?.departments?.name} ({profile?.departments?.code})
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Issues</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Pending</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-destructive">{stats.pending}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Acknowledged</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-primary">{stats.acknowledged}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Resolved</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600">{stats.resolved}</div>
            </CardContent>
          </Card>
        </div>

        {/* Issues List */}
        <div className="space-y-4">
          <h2 className="text-2xl font-bold">Department Issues</h2>
          {issues?.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No issues found in your department.
              </CardContent>
            </Card>
          ) : (
            issues?.map((issue) => (
              <Card key={issue.id} className="hover:shadow-lg transition-shadow">
                <CardContent className="p-6">
                  <div className="flex flex-col md:flex-row gap-6">
                    {/* Issue Photo */}
                    {issue.photo_url && (
                      <div className="w-full md:w-48 h-48 flex-shrink-0">
                        <img
                          src={issue.photo_url}
                          alt={issue.title}
                          className="w-full h-full object-cover rounded-lg"
                        />
                      </div>
                    )}

                    {/* Issue Details */}
                    <div className="flex-1 space-y-4">
                      <div>
                        <div className="flex items-start justify-between mb-2">
                          <h3 className="text-xl font-bold">{issue.title}</h3>
                          {getStatusBadge(issue.status, issue.is_priority)}
                        </div>
                        {issue.description && (
                          <p className="text-muted-foreground">{issue.description}</p>
                        )}
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-muted-foreground" />
                          <span>Room {issue.room_no}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span>{issue.profiles?.full_name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <span>{format(new Date(issue.reported_at), 'MMM dd, yyyy')}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          <span>Due: {format(new Date(issue.deadline), 'MMM dd')}</span>
                        </div>
                      </div>

                      {/* Status Update */}
                      <div className="flex items-center gap-4">
                        <span className="text-sm font-medium">Update Status:</span>
                        <Select
                          value={issue.status}
                          onValueChange={(value) => handleStatusChange(issue.id, value)}
                        >
                          <SelectTrigger className="w-[200px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pending">
                              <div className="flex items-center gap-2">
                                <AlertCircle className="h-4 w-4" />
                                Pending
                              </div>
                            </SelectItem>
                            <SelectItem value="acknowledged">
                              <div className="flex items-center gap-2">
                                <Clock className="h-4 w-4" />
                                Acknowledged
                              </div>
                            </SelectItem>
                            <SelectItem value="work_done">
                              <div className="flex items-center gap-2">
                                <CheckCircle2 className="h-4 w-4" />
                                Resolved
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default HodDashboard;
