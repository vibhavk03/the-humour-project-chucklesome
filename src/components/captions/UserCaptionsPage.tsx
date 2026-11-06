"use client";

import CaptionsTable from "@/components/captions/CaptionsTable";

type UserCaptionsPageProps = {
  userId: string;
};

export default function UserCaptionsPage({ userId }: UserCaptionsPageProps) {
  return (
    <CaptionsTable
      title="User Captions"
      subtitle={`Captions created by user ${userId}.`}
      profileId={userId}
    />
  );
}
