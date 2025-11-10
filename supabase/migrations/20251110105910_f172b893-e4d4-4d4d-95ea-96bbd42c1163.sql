-- Create enum for user roles
CREATE TYPE public.app_role AS ENUM ('student', 'teacher', 'hod', 'principal');

-- Create enum for issue status
CREATE TYPE public.issue_status AS ENUM ('pending', 'acknowledged', 'work_done');

-- Create departments table
CREATE TABLE public.departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  code TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  college_id TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  department_id UUID REFERENCES public.departments(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);

-- Create issues table
CREATE TABLE public.issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  room_no TEXT NOT NULL,
  item_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  photo_url TEXT,
  status public.issue_status NOT NULL DEFAULT 'pending',
  is_priority BOOLEAN NOT NULL DEFAULT false,
  reported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deadline TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days'),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create upvotes table
CREATE TABLE public.upvotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id UUID NOT NULL REFERENCES public.issues(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(issue_id, user_id)
);

-- Create notifications table
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  issue_id UUID REFERENCES public.issues(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.upvotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Create function to check user role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- RLS Policies for departments (readable by all authenticated users)
CREATE POLICY "Departments are viewable by authenticated users"
  ON public.departments FOR SELECT
  TO authenticated
  USING (true);

-- RLS Policies for profiles
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can view other profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);

-- RLS Policies for user_roles
CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Principals can view all roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'principal'));

-- RLS Policies for issues
CREATE POLICY "Users can view issues"
  ON public.issues FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can create issues"
  ON public.issues FOR INSERT
  TO authenticated
  WITH CHECK (reporter_id = auth.uid());

CREATE POLICY "HoDs can update issues in their department"
  ON public.issues FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'hod') AND
    department_id IN (
      SELECT department_id FROM public.profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Principals can update any issue"
  ON public.issues FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'principal'));

-- RLS Policies for upvotes
CREATE POLICY "Users can view upvotes"
  ON public.upvotes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can create upvotes"
  ON public.upvotes FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own upvotes"
  ON public.upvotes FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- RLS Policies for notifications
CREATE POLICY "Users can view their own notifications"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can update their own notifications"
  ON public.notifications FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

-- Create function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, college_id, full_name, email)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'college_id',
    NEW.raw_user_meta_data->>'full_name',
    NEW.email
  );
  RETURN NEW;
END;
$$;

-- Create trigger for new user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Create triggers for updated_at
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_issues_updated_at
  BEFORE UPDATE ON public.issues
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Insert some default departments
INSERT INTO public.departments (name, code) VALUES
  ('Computer Science', 'CS'),
  ('Electronics', 'EC'),
  ('Mechanical', 'ME'),
  ('Civil', 'CE'),
  ('Electrical', 'EE');

-- Create storage bucket for issue photos
INSERT INTO storage.buckets (id, name, public) VALUES ('issue-photos', 'issue-photos', true);

-- Create storage policies
CREATE POLICY "Issue photos are publicly accessible"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'issue-photos');

CREATE POLICY "Authenticated users can upload issue photos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'issue-photos');

CREATE POLICY "Users can update their own issue photos"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'issue-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own issue photos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'issue-photos' AND auth.uid()::text = (storage.foldername(name))[1]);