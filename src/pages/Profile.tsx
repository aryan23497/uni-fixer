import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useNavigate } from 'react-router-dom';
import { Header } from '@/components/Header';
import { IssueCard } from '@/components/IssueCard';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Trash } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';

const Profile = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [sortBy, setSortBy] = useState<'upvotes' | 'recent'>('recent');
  const { toast } = useToast();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);

  const { data: issues, refetch } = useQuery({
    queryKey: ['my-issues', user?.id, sortBy],
    queryFn: async () => {
      let query = supabase
        .from('issues')
        .select(`
          *,
          profiles!issues_reporter_id_fkey(full_name, college_id),
          departments(name, code),
          upvotes(count)
        `)
        .eq('reporter_id', user?.id!);

      if (sortBy === 'recent') {
        query = query.order('reported_at', { ascending: false });
      }

      const { data, error } = await query;
      if (error) throw error;

      const issuesWithUpvotes = await Promise.all(
        data.map(async (issue) => {
          const { count } = await supabase
            .from('upvotes')
            .select('id', { count: 'exact' })
            .eq('issue_id', issue.id);

          const { data: userUpvote } = await supabase
            .from('upvotes')
            .select('id')
            .eq('issue_id', issue.id)
            .eq('user_id', user?.id!)
            .maybeSingle();

          return {
            ...issue,
            upvoteCount: count || 0,
            hasUpvoted: !!userUpvote,
          };
        })
      );

      if (sortBy === 'upvotes') {
        return issuesWithUpvotes.sort((a, b) => b.upvoteCount - a.upvoteCount);
      }

      return issuesWithUpvotes;
    },
    enabled: !!user,
  });

  const handleDeleteIssue = async (issueId: string) => {
    if (!user) return;
    setDeletingId(issueId);
    try {
      console.log('Attempting to delete issue:', issueId, 'User ID:', user.id);

      const { data: issueCheck } = await supabase
        .from('issues')
        .select('reporter_id')
        .eq('id', issueId)
        .single();

      console.log('Issue reporter ID:', issueCheck?.reporter_id, 'Current user ID:', user.id);

      if (issueCheck && issueCheck.reporter_id !== user.id) {
        throw new Error('You are not the reporter of this issue');
      }

      const { error: delError, data: delData } = await supabase
        .from('issues')
        .delete()
        .eq('id', issueId)
        .eq('reporter_id', user.id)
        .select();
      console.log('Delete response:', { error: delError, data: delData });
      if (delError) throw delError;

      const { count: remainingCount, error: checkError } = await supabase
        .from('issues')
        .select('id', { count: 'exact' })
        .eq('id', issueId);
      if (checkError) throw checkError;
      if ((remainingCount ?? 0) > 0) {
        throw new Error('Delete did not apply due to permissions');
      }

      // Optimistically remove from caches and notify
      queryClient.setQueriesData({ queryKey: ['my-issues'] }, (old: any) => (Array.isArray(old) ? old.filter((i: any) => i.id !== issueId) : old));
      queryClient.setQueriesData({ queryKey: ['issues'] }, (old: any) => (Array.isArray(old) ? old.filter((i: any) => i.id !== issueId) : old));
      await queryClient.invalidateQueries({ queryKey: ['issues'] });
      await queryClient.invalidateQueries({ queryKey: ['my-issues'] });
      toast({ title: 'Issue deleted', description: 'Your report has been removed.' });
    } catch (error: any) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container max-w-4xl mx-auto py-6 px-4 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">My Issued Reports</h1>
          <Tabs value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
            <TabsList>
              <TabsTrigger value="recent">Recent</TabsTrigger>
              <TabsTrigger value="upvotes">Most Upvoted</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {issues && issues.length === 0 ? (
          <Card className="p-6 text-center text-muted-foreground">No reports yet.</Card>
        ) : (
          <div className="space-y-4">
            {issues?.map((issue) => (
              <div key={issue.id} className="relative">
                <div className="absolute right-4 top-4">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={() => handleDeleteIssue(issue.id)}
                    disabled={deletingId === issue.id}
                  >
                    <Trash className="h-4 w-4" />
                    <span className="ml-2">Delete</span>
                  </Button>
                </div>
                <IssueCard
                  issue={issue}
                  upvoteCount={issue.upvoteCount}
                  hasUpvoted={issue.hasUpvoted}
                  onUpvoteChange={refetch}
                  canDelete
                  deleting={deletingId === issue.id}
                  onDelete={() => handleDeleteIssue(issue.id)}
                />
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default Profile;