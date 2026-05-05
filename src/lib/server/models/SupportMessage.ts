import type { ObjectId } from 'mongodb';

export type SupportMessageStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export type SupportMessageSender = 'student' | 'instructor' | 'custodian' | 'superadmin';
export type SupportTicketOwnerRole = 'student' | 'instructor' | 'custodian';

export interface SupportMessage {
	_id?: ObjectId;
	/** The user who opened the conversation */
	studentId: ObjectId;
	/** Role of the ticket owner — student, instructor, or custodian */
	ownerRole: SupportTicketOwnerRole;
	/** Subject / topic of the support ticket */
	subject: string;
	/** Ordered list of chat messages in this conversation */
	messages: SupportChatEntry[];
	status: SupportMessageStatus;
	/** Timestamp of the last message — used for sorting */
	lastMessageAt: Date;
	/** Unread count for the superadmin side */
	unreadBySuperadmin: number;
	/** Unread count for the ticket owner side */
	unreadByStudent: number;
	createdAt: Date;
	updatedAt: Date;
}

export interface SupportChatEntry {
	_id?: ObjectId;
	sender: SupportMessageSender;
	senderId: ObjectId;
	senderName: string;
	body: string;
	sentAt: Date;
}

export interface SupportMessageResponse {
	id: string;
	studentId: string;
	ownerRole: SupportTicketOwnerRole;
	studentName?: string;
	studentEmail?: string;
	subject: string;
	messages: SupportChatEntryResponse[];
	status: SupportMessageStatus;
	lastMessageAt: string;
	unreadBySuperadmin: number;
	unreadByStudent: number;
	createdAt: string;
	updatedAt: string;
}

export interface SupportChatEntryResponse {
	id: string;
	sender: SupportMessageSender;
	senderId: string;
	senderName: string;
	body: string;
	sentAt: string;
}

export function toSupportMessageResponse(
	doc: SupportMessage,
	studentName?: string,
	studentEmail?: string
): SupportMessageResponse {
	return {
		id: doc._id!.toString(),
		studentId: doc.studentId.toString(),
		ownerRole: doc.ownerRole ?? 'student',
		studentName,
		studentEmail,
		subject: doc.subject,
		messages: doc.messages.map((m) => ({
			id: m._id?.toString() ?? '',
			sender: m.sender,
			senderId: m.senderId.toString(),
			senderName: m.senderName,
			body: m.body,
			sentAt: m.sentAt.toISOString()
		})),
		status: doc.status,
		lastMessageAt: doc.lastMessageAt.toISOString(),
		unreadBySuperadmin: doc.unreadBySuperadmin,
		unreadByStudent: doc.unreadByStudent,
		createdAt: doc.createdAt.toISOString(),
		updatedAt: doc.updatedAt.toISOString()
	};
}
