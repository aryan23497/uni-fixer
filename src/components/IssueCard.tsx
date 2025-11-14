import { useState } from 'react';
import { ArrowBigUp, MessageSquare, Clock, CheckCircle2, AlertCircle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';

interface IssueCardProps {
  issue: any;
  upvoteCount: number;
  hasUpvoted: boolean;
  onUpvoteChange: () => void;
  canDelete?: boolean;
  onDelete?: () => void;
  deleting?: boolean;
}

export const IssueCard = ({ issue, upvoteCount, hasUpvoted, onUpvoteChange, canDelete, onDelete, deleting }: IssueCardProps) => {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleUpvote = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      if (hasUpvoted) {
        const { error } = await supabase
          .from('upvotes')
          .delete()
          .eq('issue_id', issue.id)
          .eq('user_id', user.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('upvotes')
          .insert({ issue_id: issue.id, user_id: user.id });

        if (error) throw error;
      }

      onUpvoteChange();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = () => {
    switch (issue.status) {
      case 'work_done':
        return 'bg-green-500/10 text-green-600 border-green-500/20';
      case 'acknowledged':
        return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
      default:
        return 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20';
    }
  };

  const getStatusIcon = () => {
    switch (issue.status) {
      case 'work_done':
        return <CheckCircle2 className="h-3 w-3" />;
      case 'acknowledged':
        return <Clock className="h-3 w-3" />;
      default:
        return <AlertCircle className="h-3 w-3" />;
    }
  };

  const daysRemaining = Math.ceil(
    (new Date(issue.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );

  return (
    <Card className="overflow-hidden hover:shadow-elevated transition-all duration-200 bg-reddit-card hover:bg-reddit-hover border-border/50">
      <div className="flex gap-2 p-4">
        {/* Upvote section */}
        <div className="flex flex-col items-center gap-1 pt-1">
          <Button
            variant="ghost"
            size="icon"
            className={`h-8 w-8 rounded-md transition-colors ${
              hasUpvoted
                ? 'text-upvote-active bg-upvote/10 hover:bg-upvote/20'
                : 'text-muted-foreground hover:text-upvote hover:bg-upvote/10'
            }`}
            onClick={handleUpvote}
            disabled={loading}
          >
            <ArrowBigUp className="h-6 w-6" fill={hasUpvoted ? 'currentColor' : 'none'} />
          </Button>
          <span className={`text-sm font-bold ${hasUpvoted ? 'text-upvote-active' : 'text-foreground'}`}>
            {upvoteCount}
          </span>
        </div>

        {/* Content section */}
        <div className="flex-1 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-1 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className={getStatusColor()}>
                  {getStatusIcon()}
                  <span className="ml-1 capitalize">{issue.status.replace('_', ' ')}</span>
                </Badge>
                
                {issue.is_priority && (
                  <Badge variant="destructive" className="gap-1">
                    <AlertCircle className="h-3 w-3" />
                    Priority
                  </Badge>
                )}

                {issue.status !== 'work_done' && daysRemaining <= 7 && (
                  <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20">
                    {daysRemaining}d left
                  </Badge>
                )}
              </div>

              <h3 className="text-lg font-semibold text-foreground hover:text-primary cursor-pointer transition-colors">
                {issue.title}
              </h3>

              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Room: {issue.room_no}</span>
                <span>•</span>
                <span>Item: {issue.item_id}</span>
                <span>•</span>
                <span>by {issue.profiles?.full_name}</span>
                <span>•</span>
                <span>{formatDistanceToNow(new Date(issue.reported_at), { addSuffix: true })}</span>
              </div>
            </div>
            {canDelete && (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive"
                onClick={onDelete}
                disabled={loading || deleting}
              >
                Delete
              </Button>
            )}
          </div>

          {issue.description && (
            <p className="text-sm text-foreground/80 line-clamp-2">{issue.description}</p>
          )}

          {issue.photo_url && (
            <div className="mt-2">
              <img
                src={issue.photo_url}
                alt="Issue"
                className="rounded-lg max-h-64 object-cover w-full"
              />
            </div>
          )}
        </div>
      </div>
    </Card>
  );
};
