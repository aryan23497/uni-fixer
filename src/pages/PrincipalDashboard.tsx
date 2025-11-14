import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useNavigate } from 'react-router-dom';
import { Header } from '@/components/Header';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Clock, MapPin, Calendar, User, CheckCircle2, AlertCircle, Loader2, Building2 } from 'lucide-react';
import { format } from 'date-fns';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

const PrincipalDashboard = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [hasPrincipalRole, setHasPrincipalRole] = useState(false);
  const [selectedDepartment, setSelectedDepartment] = useState<string>('all');

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
      return;
    }

    // Check if user has Principal role
    if (user) {
      supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'principal')
        .single()
        .then(({ data }) => {
          if (!data) {
            toast({
              title: 'Access Denied',
              description: 'You do not have Principal access.',
              variant: 'destructive',
            });
            navigate('/');
          } else {
            setHasPrincipalRole(true);
          }
        });
    }
  }, [user, loading, navigate, toast]);

  // Fetch all departments
  const { data: departments } = useQuery({
    queryKey: ['departments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('departments')
        .select('*')
        .in('code', ['CS', 'EE', 'ME', 'HU'])
        .order('name');
      if (error) throw error;
      return data;
    },
    enabled: hasPrincipalRole,
  });

  // Fetch all issues
  const { data: issues, refetch } = useQuery({
    queryKey: ['principal-issues', selectedDepartment],
    queryFn: async () => {
      let query = supabase
        .from('issues')
        .select(`
          *,
          profiles!issues_reporter_id_fkey(full_name, college_id),
          departments(name, code)
        `)
        .order('reported_at', { ascending: false });

      if (selectedDepartment !== 'all') {
        query = query.eq('department_id', selectedDepartment);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: hasPrincipalRole,
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

  if (loading || !hasPrincipalRole) {
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
    priority: issues?.filter(i => i.is_priority).length || 0,
  };

  // Department-wise stats
  const departmentStats = departments?.map(dept => ({
    ...dept,
    total: issues?.filter(i => i.department_id === dept.id).length || 0,
    pending: issues?.filter(i => i.department_id === dept.id && i.status === 'pending').length || 0,
  }));

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary to-background">
      <Header />
      
      <div className="container py-8 px-4">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Principal Dashboard</h1>
          <p className="text-muted-foreground">
            College-wide Issue Management
          </p>
        </div>

        {/* Overall Stats */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
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
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Priority</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-orange-600">{stats.priority}</div>
            </CardContent>
          </Card>
        </div>

        {/* Department Stats */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Department Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {departmentStats?.map((dept) => (
                <div key={dept.id} className="p-4 border rounded-lg hover:bg-secondary/50 transition-colors">
                  <div className="flex items-center gap-2 mb-2">
                    <Building2 className="h-4 w-4 text-primary" />
                    <h3 className="font-semibold">{dept.name}</h3>
                  </div>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total:</span>
                      <span className="font-medium">{dept.total}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Pending:</span>
                      <span className="font-medium text-destructive">{dept.pending}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Filter by Department */}
        <div className="mb-6 flex items-center gap-4">
          <span className="font-medium">Filter by Department:</span>
          <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
            <SelectTrigger className="w-[250px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Departments</SelectItem>
              {departments?.map((dept) => (
                <SelectItem key={dept.id} value={dept.id}>
                  {dept.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Issues List */}
        <div className="space-y-4">
          <h2 className="text-2xl font-bold">All Issues</h2>
          {issues?.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No issues found.
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
                          <div>
                            <h3 className="text-xl font-bold">{issue.title}</h3>
                            <p className="text-sm text-muted-foreground">
                              {issue.departments?.name} ({issue.departments?.code})
                            </p>
                          </div>
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

export default PrincipalDashboard;
