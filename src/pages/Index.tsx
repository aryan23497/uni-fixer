import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useNavigate } from 'react-router-dom';
import { Header } from '@/components/Header';
import { IssueCard } from '@/components/IssueCard';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Upload } from 'lucide-react';

const Index = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [sortBy, setSortBy] = useState<'upvotes' | 'recent'>('upvotes');
  const [isNewIssueOpen, setIsNewIssueOpen] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Form state
  const [roomNo, setRoomNo] = useState('');
  const [itemId, setItemId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [departmentId, setDepartmentId] = useState('');

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);

  // Fetch departments
  const { data: departments } = useQuery({
    queryKey: ['departments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('departments')
        .select('*')
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  // Fetch issues with upvote counts
  const { data: issues, refetch } = useQuery({
    queryKey: ['issues', sortBy],
    queryFn: async () => {
      let query = supabase
        .from('issues')
        .select(`
          *,
          profiles!issues_reporter_id_fkey(full_name, college_id),
          departments(name, code),
          upvotes(count)
        `);

      if (sortBy === 'recent') {
        query = query.order('reported_at', { ascending: false });
      }

      const { data, error } = await query;
      if (error) throw error;

      // Get upvote counts and user's upvotes
      const issuesWithUpvotes = await Promise.all(
        data.map(async (issue) => {
          const { count } = await supabase
            .from('upvotes')
            .select('*', { count: 'exact', head: true })
            .eq('issue_id', issue.id);

          const { data: userUpvote } = await supabase
            .from('upvotes')
            .select('id')
            .eq('issue_id', issue.id)
            .eq('user_id', user?.id!)
            .single();

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

  const handleSubmitIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    setUploading(true);

    try {
      let photoUrl = null;

      // Upload photo if exists
      if (photo) {
        const fileExt = photo.name.split('.').pop();
        const fileName = `${user?.id}/${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('issue-photos')
          .upload(fileName, photo);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('issue-photos')
          .getPublicUrl(fileName);

        photoUrl = publicUrl;
      }

      // Create issue
      const { error } = await supabase.from('issues').insert({
        reporter_id: user?.id,
        department_id: departmentId,
        room_no: roomNo,
        item_id: itemId,
        title,
        description,
        photo_url: photoUrl,
      });

      if (error) throw error;

      toast({
        title: 'Issue reported',
        description: 'Your issue has been successfully reported.',
      });

      setIsNewIssueOpen(false);
      resetForm();
      refetch();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  };

  const resetForm = () => {
    setRoomNo('');
    setItemId('');
    setTitle('');
    setDescription('');
    setPhoto(null);
    setDepartmentId('');
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
      <Header onNewIssue={() => setIsNewIssueOpen(true)} />

      <main className="container max-w-4xl mx-auto py-6 px-4 space-y-6">
        {/* Sort tabs */}
        <Tabs value={sortBy} onValueChange={(v) => setSortBy(v as any)} className="w-full">
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="upvotes" className="flex-1 sm:flex-none">
              Most Upvoted
            </TabsTrigger>
            <TabsTrigger value="recent" className="flex-1 sm:flex-none">
              Recent
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Issues feed */}
        <div className="space-y-4">
          {issues?.map((issue) => (
            <IssueCard
              key={issue.id}
              issue={issue}
              upvoteCount={issue.upvoteCount}
              hasUpvoted={issue.hasUpvoted}
              onUpvoteChange={refetch}
            />
          ))}
        </div>
      </main>

      {/* New Issue Dialog */}
      <Dialog open={isNewIssueOpen} onOpenChange={setIsNewIssueOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Report New Issue</DialogTitle>
            <DialogDescription>
              Fill in the details about the issue you want to report.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmitIssue} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="room-no">Room Number</Label>
                <Input
                  id="room-no"
                  placeholder="e.g., B216"
                  value={roomNo}
                  onChange={(e) => setRoomNo(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="item-id">Item ID</Label>
                <Input
                  id="item-id"
                  placeholder="e.g., FAN-01"
                  value={itemId}
                  onChange={(e) => setItemId(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="department">Department</Label>
              <Select value={departmentId} onValueChange={setDepartmentId} required>
                <SelectTrigger>
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent className="bg-popover">
                  {departments?.map((dept) => (
                    <SelectItem key={dept.id} value={dept.id}>
                      {dept.name} ({dept.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="title">Issue Title</Label>
              <Input
                id="title"
                placeholder="Brief description of the issue"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description (Optional)</Label>
              <Textarea
                id="description"
                placeholder="Additional details..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="photo">Photo (Optional)</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="photo"
                  type="file"
                  accept="image/*"
                  onChange={(e) => setPhoto(e.target.files?.[0] || null)}
                  className="flex-1"
                />
                {photo && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPhoto(null)}
                  >
                    Clear
                  </Button>
                )}
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsNewIssueOpen(false);
                  resetForm();
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={uploading}>
                {uploading ? 'Submitting...' : 'Submit Issue'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Index;
