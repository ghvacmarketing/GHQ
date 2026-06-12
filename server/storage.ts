import { type Quote, type InsertQuote, type PartData, type InsertPart, type Technician, type InsertTechnician, type Process, type InsertProcess, type ProcessAttachment, type InsertProcessAttachment, type Category, type InsertCategory, type Setting, type InsertSetting, type PdfFile, type InsertPdfFile, type Announcement, type InsertAnnouncement, type PhoneWhitelist, type InsertPhoneWhitelist, type AuthToken, type InsertAuthToken, type Lead, type InsertLead, type InsertLeadHistory, type LeadHistory, type ImportBatch, type InsertImportBatch, type Customer, type InsertCustomer, type CustomerImportBatch, type InsertCustomerImportBatch, type QuoteConversation, type InsertQuoteConversation, type QuoteMessage, type InsertQuoteMessage, type Voicemail, type InsertVoicemail, type SavedProposal, type InsertSavedProposal, type CallLogDay, type InsertCallLogDay, type CallLog, type InsertCallLog, type CallLogTask, type InsertCallLogTask, type PortalUser, type InsertPortalUser, type EmployeeProfile, type InsertEmployeeProfile, type Compensation, type InsertCompensation, type Paystub, type InsertPaystub, type CompensationAuditLog, type InsertCompensationAuditLog, type EmployeeDocument, type InsertEmployeeDocument, type WeatherCache, type InsertWeatherCache, type CallDaily, type WeatherDaily, type CrmWorkOrder, type InsertCrmWorkOrder, type CrmInvoice, type InsertCrmInvoice, type CrmInvoiceLineItem, type InsertCrmInvoiceLineItem, type CrmItem, type InsertCrmItem, type CrmMessagingConversation, type InsertCrmMessagingConversation, type CrmMessagingMessage, type InsertCrmMessagingMessage, type CrmMessagingConversationTag, type InsertCrmMessagingConversationTag, type CrmTimeEntry, type InsertCrmTimeEntry, type SmsNotificationLog, type InsertSmsNotificationLog, type SmsNotificationType, type CrmProjectTask, type InsertCrmProjectTask, type Task, type InsertTask, type TaskType, type InsertTaskType, type TaskActivity, type InsertTaskActivity, type TaskSubtask, type InsertTaskSubtask, type ProposalTemplate, type InsertProposalTemplate, quotes, parts, technicians, processes, processAttachments, categories, settings, pdfFiles, announcements, phoneWhitelist, authTokens, leads, leadHistory, importBatches, customers, customerImportBatches, quoteConversations, quoteMessages, voicemails, savedProposals, callLogDays, callLogs, callLogTasks, portalUsers, employeeProfiles, compensations, paystubs, compensationAuditLog, employeeDocuments, weatherCache, callDaily, weatherDaily, crmWorkOrders, crmInvoices, crmInvoiceLineItems, crmItems, crmMessagingConversations, crmMessagingMessages, crmMessagingConversationTags, crmCustomers, crmTimeEntries, smsNotificationLog, crmUsers, crmProjectTasks, tasks, taskTypes, taskActivity, taskSubtasks, proposalTemplates, proposalTemplateImages, type ProposalTemplateImage, type InsertProposalTemplateImage, customerFiles, type CustomerFile, type InsertCustomerFile, rebateCases, rebateCaseWorkflowSteps, rebateCaseScopeChecklist, rebateCaseDocuments, rebateCaseActivityLog, type RebateCase, type InsertRebateCase, type RebateCaseWorkflowStep, type InsertRebateCaseWorkflowStep, type RebateCaseScopeChecklist, type InsertRebateCaseScopeChecklist, type RebateCaseDocument, type InsertRebateCaseDocument, type RebateCaseActivityLog, type InsertRebateCaseActivityLog, type RebateWorkflowStep, rebateWorkflowStepEnum } from "@shared/schema";
import {
  signatureDocuments, signatureRecipients, signatureFields,
  type SignatureDocument, type InsertSignatureDocument,
  type SignatureRecipient, type InsertSignatureRecipient,
  type SignatureField, type InsertSignatureField,
} from "@shared/schema";
import { randomUUID } from "crypto";
import { db } from "./db";
import { eq, or, and, ilike, sql, notInArray, inArray, desc, gte, lte, asc, isNull, isNotNull, lt, ne, type SQL } from "drizzle-orm";

export interface IStorage {
  // Quote operations
  getQuote(id: string): Promise<Quote | undefined>;
  getAllQuotes(): Promise<Quote[]>;
  createQuote(quote: InsertQuote): Promise<Quote>;
  updateQuote(id: string, quote: Partial<Quote>): Promise<Quote | undefined>;
  deleteQuote(id: string): Promise<boolean>;
  
  // Part operations
  getPart(id: string): Promise<PartData | undefined>;
  getAllParts(): Promise<PartData[]>;
  getPartsByCategory(category: string): Promise<PartData[]>;
  createPart(part: InsertPart): Promise<PartData>;
  
  // Technician operations
  getTechnician(id: string): Promise<Technician | undefined>;
  getAllTechnicians(): Promise<Technician[]>;
  createTechnician(technician: InsertTechnician): Promise<Technician>;
  
  // Process operations
  getProcess(id: string): Promise<Process | undefined>;
  getAllProcesses(): Promise<Process[]>;
  getProcessesByCategory(category: string): Promise<Process[]>;
  createProcess(process: InsertProcess): Promise<Process>;
  updateProcess(id: string, process: Partial<Process>): Promise<Process | undefined>;
  deleteProcess(id: string): Promise<boolean>;
  
  // Process Attachment operations
  getProcessAttachment(id: string): Promise<ProcessAttachment | undefined>;
  getProcessAttachments(processId: string): Promise<ProcessAttachment[]>;
  createProcessAttachment(attachment: InsertProcessAttachment): Promise<ProcessAttachment>;
  deleteProcessAttachment(id: string): Promise<boolean>;
  updateAttachmentOrder(id: string, displayOrder: string): Promise<ProcessAttachment | undefined>;
  
  // Category operations
  getAllCategories(): Promise<Category[]>;
  createCategory(category: InsertCategory): Promise<Category>;
  updateCategory(id: string, category: Partial<Category>): Promise<Category | undefined>;
  deleteCategory(id: string): Promise<boolean>;
  
  // Settings operations
  getSetting(key: string): Promise<Setting | undefined>;
  getAllSettings(): Promise<Setting[]>;
  setSetting(key: string, value: string): Promise<Setting>;
  updateSetting(key: string, value: string): Promise<Setting>;
  deleteSetting(key: string): Promise<boolean>;
  
  // PDF File operations
  getPriceBookPdf(): Promise<PdfFile | undefined>;
  getAllPdfFiles(): Promise<PdfFile[]>;
  uploadPriceBookPdf(pdfData: InsertPdfFile): Promise<PdfFile>;
  createPdfFile(pdfData: InsertPdfFile): Promise<PdfFile>;
  deletePriceBookPdf(): Promise<boolean>;
  
  // Announcement operations
  getActiveAnnouncement(): Promise<Announcement | undefined>;
  getAllAnnouncements(): Promise<Announcement[]>;
  createAnnouncement(announcement: InsertAnnouncement): Promise<Announcement>;
  updateAnnouncement(id: string, announcement: Partial<Announcement>): Promise<Announcement | undefined>;
  deleteAnnouncement(id: string): Promise<boolean>;
  
  // Phone Whitelist operations
  getPhoneWhitelistEntry(phoneNumber: string): Promise<PhoneWhitelist | undefined>;
  getAllPhoneWhitelist(): Promise<PhoneWhitelist[]>;
  createPhoneWhitelistEntry(entry: InsertPhoneWhitelist): Promise<PhoneWhitelist>;
  deletePhoneWhitelistEntry(id: string): Promise<boolean>;
  
  // Auth Token operations
  createAuthToken(token: InsertAuthToken): Promise<AuthToken>;
  getAuthToken(token: string): Promise<AuthToken | undefined>;
  deleteAuthToken(token: string): Promise<boolean>;
  deleteExpiredTokens(): Promise<number>;
  
  // Lead Management operations
  getLead(id: string): Promise<Lead | undefined>;
  getAllLeads(): Promise<Lead[]>;
  getLeadsByStatus(status: string): Promise<Lead[]>;
  getActiveLeads(): Promise<Lead[]>; // Not won or lost
  getWonLeads(): Promise<Lead[]>;
  getLostLeads(): Promise<Lead[]>;
  createLead(lead: InsertLead): Promise<Lead>;
  updateLead(id: string, lead: Partial<Lead>): Promise<Lead | undefined>;
  deleteLead(id: string): Promise<boolean>;
  findDuplicateLead(phone?: string, email?: string, externalId?: string): Promise<Lead | undefined>;
  
  // Service Pipeline operations
  getServiceLeads(): Promise<Lead[]>;
  updateServiceLead(id: string, updates: Partial<Lead>): Promise<Lead | undefined>;
  
  // Lead History operations
  createLeadHistory(history: InsertLeadHistory): Promise<LeadHistory>;
  getLeadHistory(leadId: string): Promise<LeadHistory[]>;
  
  // Import Batch operations
  createImportBatch(batch: InsertImportBatch): Promise<ImportBatch>;
  getImportBatch(id: string): Promise<ImportBatch | undefined>;
  getAllImportBatches(): Promise<ImportBatch[]>;
  
  // Customer Database operations (FieldEdge imports)
  getCustomer(id: string): Promise<Customer | undefined>;
  getAllCustomers(): Promise<Customer[]>;
  searchCustomers(term: string, searchAll?: boolean): Promise<Customer[]>;
  createCustomer(customer: InsertCustomer): Promise<Customer>;
  updateCustomer(id: string, customer: Partial<Customer>): Promise<Customer | undefined>;
  upsertCustomerByChecksum(customer: InsertCustomer): Promise<{ action: 'created' | 'updated' | 'skipped'; customer: Customer }>;
  getCustomerByChecksum(checksum: string): Promise<Customer | undefined>;
  batchImportCustomers(customerList: InsertCustomer[]): Promise<{ created: number; updated: number; skipped: number; errors: number }>;
  deleteCustomersNotInChecksums(checksums: string[]): Promise<number>;
  
  // Customer Import Batch operations
  createCustomerImportBatch(batch: InsertCustomerImportBatch): Promise<CustomerImportBatch>;
  updateCustomerImportBatch(id: string, batch: Partial<CustomerImportBatch>): Promise<CustomerImportBatch | undefined>;
  getCustomerImportBatch(id: string): Promise<CustomerImportBatch | undefined>;
  getCustomerImportBatchByFileHash(fileHash: string): Promise<CustomerImportBatch | undefined>;
  getAllCustomerImportBatches(): Promise<CustomerImportBatch[]>;
  
  // Backup operations
  clearAllData(): Promise<void>;
  
  // Quote Conversation operations (AI memory)
  createQuoteConversation(conversation: InsertQuoteConversation): Promise<QuoteConversation>;
  getQuoteConversation(id: string): Promise<QuoteConversation | undefined>;
  updateQuoteConversation(id: string, updates: Partial<QuoteConversation>): Promise<QuoteConversation | undefined>;
  deleteQuoteConversation(id: string): Promise<boolean>;
  
  // Quote Message operations
  createQuoteMessage(message: InsertQuoteMessage): Promise<QuoteMessage>;
  getQuoteMessages(conversationId: string, limit?: number): Promise<QuoteMessage[]>;
  getRecentQuoteMessages(conversationId: string, limit?: number): Promise<QuoteMessage[]>;
  
  // Voicemail operations (Trello webhook integration)
  getVoicemail(id: string): Promise<Voicemail | undefined>;
  getAllVoicemails(): Promise<Voicemail[]>;
  getVoicemailsByStatus(status: string): Promise<Voicemail[]>;
  getVoicemailByTrelloCardId(trelloCardId: string): Promise<Voicemail | undefined>;
  upsertVoicemail(data: InsertVoicemail): Promise<Voicemail>;
  updateVoicemail(id: string, updates: Partial<Voicemail>): Promise<Voicemail | undefined>;
  updateVoicemailMp3(trelloCardId: string, mp3Filename: string): Promise<Voicemail | undefined>;

  // Saved Proposals operations
  getAllSavedProposals(): Promise<SavedProposal[]>;
  getSavedProposal(id: string): Promise<SavedProposal | undefined>;
  createSavedProposal(proposal: InsertSavedProposal): Promise<SavedProposal>;
  updateSavedProposal(id: string, updates: Partial<SavedProposal>): Promise<SavedProposal | undefined>;
  deleteSavedProposal(id: string): Promise<boolean>;

  // Call Log operations
  getCallLogDays(): Promise<{ id: string; date: string; count: number }[]>;
  getOrCreateCallLogDay(date: string): Promise<CallLogDay>;
  getCallLogsByDay(date: string): Promise<CallLog[]>;
  createCallLog(data: InsertCallLog): Promise<CallLog>;
  updateCallLog(id: string, data: Partial<InsertCallLog>): Promise<CallLog | undefined>;
  deleteCallLog(id: string): Promise<boolean>;
  searchCallLogs(query: string): Promise<(CallLog & { date: string })[]>;
  getCallLogById(id: string): Promise<CallLog | null>;

  // Call Log Task operations
  getTasksByCallLog(callLogId: string): Promise<CallLogTask[]>;
  createCallLogTask(data: InsertCallLogTask): Promise<CallLogTask>;
  updateCallLogTask(id: string, data: Partial<InsertCallLogTask>): Promise<CallLogTask | undefined>;
  deleteCallLogTask(id: string): Promise<boolean>;
  getTasksByDay(date: string): Promise<(CallLogTask & { callLogId: string })[]>;
  getCallLogTaskById(id: string): Promise<CallLogTask | null>;

  // Portal Users operations
  getPortalUser(id: string): Promise<PortalUser | undefined>;
  getPortalUserByUsername(username: string): Promise<PortalUser | undefined>;
  getPortalUserByEmail(email: string): Promise<PortalUser | undefined>;
  getAllPortalUsers(): Promise<PortalUser[]>;
  createPortalUser(data: InsertPortalUser): Promise<PortalUser>;
  updatePortalUser(id: string, data: Partial<InsertPortalUser>): Promise<PortalUser | undefined>;
  updatePortalUserLastLogin(id: string): Promise<void>;

  // Employee Profiles operations
  getEmployeeProfile(userId: string): Promise<EmployeeProfile | undefined>;
  getAllEmployeeProfiles(): Promise<EmployeeProfile[]>;
  createEmployeeProfile(data: InsertEmployeeProfile): Promise<EmployeeProfile>;
  updateEmployeeProfile(userId: string, data: Partial<InsertEmployeeProfile>): Promise<EmployeeProfile | undefined>;

  // Compensations operations
  getCurrentCompensation(userId: string): Promise<Compensation | undefined>;
  getCompensationHistory(userId: string): Promise<Compensation[]>;
  createCompensation(data: InsertCompensation): Promise<Compensation>;
  updateCompensation(id: string, data: Partial<InsertCompensation>): Promise<Compensation | undefined>;

  // Paystubs operations
  getPaystubs(userId: string): Promise<Paystub[]>;
  getAllPaystubs(): Promise<Paystub[]>;
  createPaystub(data: InsertPaystub): Promise<Paystub>;
  deletePaystub(id: string): Promise<boolean>;

  // Compensation Audit Log operations
  getCompensationAuditLog(userId: string): Promise<CompensationAuditLog[]>;
  getAllCompensationAuditLogs(): Promise<CompensationAuditLog[]>;
  createCompensationAuditLog(data: InsertCompensationAuditLog): Promise<CompensationAuditLog>;

  // Employee Documents operations
  getEmployeeDocuments(userId: string | null): Promise<EmployeeDocument[]>;
  createEmployeeDocument(data: InsertEmployeeDocument): Promise<EmployeeDocument>;
  deleteEmployeeDocument(id: string): Promise<boolean>;

  // Weather Cache operations
  getWeatherCache(): Promise<WeatherCache | undefined>;
  upsertWeatherCache(data: InsertWeatherCache): Promise<WeatherCache>;

  // Weather Impact operations
  upsertCallDaily(date: string, inboundCalls: number): Promise<void>;
  upsertWeatherDaily(date: string, avgTemp: number, maxTemp: number, minTemp: number): Promise<void>;
  getWeatherImpactData(startDate: string, endDate: string): Promise<{date: string, calls: number, hotIndex: number, coldIndex: number, avgTempF: number}[]>;

  // CRM WorkOrder operations
  createWorkOrder(data: InsertCrmWorkOrder): Promise<CrmWorkOrder>;
  getWorkOrder(id: string): Promise<CrmWorkOrder | undefined>;
  getWorkOrdersByJobId(jobId: string): Promise<CrmWorkOrder[]>;
  getWorkOrdersByCustomerId(customerId: string): Promise<CrmWorkOrder[]>;
  getWorkOrdersByProjectId(projectId: string): Promise<CrmWorkOrder[]>;
  getWorkOrdersByDateRange(startDate: Date, endDate: Date): Promise<CrmWorkOrder[]>;
  getWorkOrdersByTechId(techId: string, date?: Date): Promise<CrmWorkOrder[]>;
  getUnassignedWorkOrders(): Promise<CrmWorkOrder[]>;
  getSchedulableWorkOrders(): Promise<CrmWorkOrder[]>;
  updateWorkOrder(id: string, data: Partial<InsertCrmWorkOrder>): Promise<CrmWorkOrder | undefined>;
  deleteWorkOrder(id: string): Promise<boolean>;

  // CRM Invoice operations
  createInvoice(data: InsertCrmInvoice): Promise<CrmInvoice>;
  getInvoice(id: string): Promise<CrmInvoice | undefined>;
  getInvoices(filters?: { jobId?: string; customerId?: string; status?: string; workOrderId?: string }): Promise<CrmInvoice[]>;
  getInvoiceWithLineItems(id: string): Promise<{ invoice: CrmInvoice; lineItems: CrmInvoiceLineItem[] } | undefined>;
  updateInvoice(id: string, data: Partial<InsertCrmInvoice>): Promise<CrmInvoice | undefined>;
  deleteInvoice(id: string): Promise<boolean>;

  // CRM Invoice Line Item operations
  createInvoiceLineItem(data: InsertCrmInvoiceLineItem): Promise<CrmInvoiceLineItem>;
  getInvoiceLineItems(invoiceId: string): Promise<CrmInvoiceLineItem[]>;
  updateInvoiceLineItem(id: string, data: Partial<InsertCrmInvoiceLineItem>): Promise<CrmInvoiceLineItem | undefined>;
  deleteInvoiceLineItem(id: string): Promise<boolean>;

  // CRM Items operations
  getAllCrmItems(): Promise<CrmItem[]>;
  getCrmItem(id: string): Promise<CrmItem | undefined>;
  createCrmItem(data: InsertCrmItem): Promise<CrmItem>;
  updateCrmItem(id: string, data: Partial<InsertCrmItem>): Promise<CrmItem | undefined>;
  deleteCrmItem(id: string): Promise<boolean>;
  searchCrmItems(query: string): Promise<CrmItem[]>;

  // Messaging operations
  getMessagingConversations(filters?: { status?: string; assignedToId?: string; customerId?: string; search?: string }): Promise<CrmMessagingConversation[]>;
  getMessagingConversationById(id: string): Promise<CrmMessagingConversation | undefined>;
  createMessagingConversation(conversation: InsertCrmMessagingConversation): Promise<CrmMessagingConversation>;
  updateMessagingConversation(id: string, updates: Partial<InsertCrmMessagingConversation>): Promise<CrmMessagingConversation | undefined>;
  getMessagesForConversation(conversationId: string): Promise<(CrmMessagingMessage & { authorName?: string | null })[]>;
  createMessage(message: InsertCrmMessagingMessage): Promise<CrmMessagingMessage>;
  updateMessage(id: string, updates: Partial<InsertCrmMessagingMessage>): Promise<CrmMessagingMessage | undefined>;
  getConversationTags(conversationId: string): Promise<CrmMessagingConversationTag[]>;
  addConversationTag(conversationId: string, tag: string): Promise<CrmMessagingConversationTag>;
  removeConversationTag(conversationId: string, tag: string): Promise<void>;
  deleteMessagingConversation(id: string): Promise<boolean>;
  getMobileConversations(userId: string, filters?: { status?: string; search?: string }): Promise<(CrmMessagingConversation & { customer: { id: string; name: string; phone: string | null } | null })[]>;
  searchCrmCustomers(search: string, limit?: number): Promise<{ id: string; name: string; phone: string | null; email: string | null }[]>;
  getMessagingConversationByExternalId(externalConversationId: string, externalSource: string): Promise<CrmMessagingConversation | undefined>;
  getMessagingConversationByPhone(phoneNumber: string): Promise<CrmMessagingConversation | undefined>;
  getCrmCustomerByPhone(phone: string): Promise<{ id: string; name: string; phone: string | null; email: string | null } | undefined>;

  // Time Entry operations
  getActiveTimeEntry(technicianId: string): Promise<CrmTimeEntry | null>;
  clockIn(technicianId: string, workOrderId?: string, source?: string): Promise<CrmTimeEntry>;
  clockOut(entryId: string, notes?: string): Promise<CrmTimeEntry>;
  getTimeEntries(filters: { technicianId?: string; startDate?: Date; endDate?: Date }): Promise<CrmTimeEntry[]>;
  updateTimeEntry(id: string, data: Partial<InsertCrmTimeEntry>): Promise<CrmTimeEntry>;
  deleteTimeEntry(id: string): Promise<void>;
  getActiveTimeEntries(): Promise<CrmTimeEntry[]>;

  // SMS Notification Log operations
  createSmsNotificationLog(data: InsertSmsNotificationLog): Promise<SmsNotificationLog>;
  getSmsNotificationByReference(notificationType: SmsNotificationType, referenceId: string, referenceType: 'maintenance_visit' | 'work_order' | 'invoice'): Promise<SmsNotificationLog | undefined>;
  updateSmsNotificationLog(id: string, data: Partial<InsertSmsNotificationLog>): Promise<SmsNotificationLog | undefined>;

  // CRM Project Task operations
  getProjectTasks(projectId: string): Promise<CrmProjectTask[]>;
  getProjectTask(id: string): Promise<CrmProjectTask | undefined>;
  createProjectTask(data: InsertCrmProjectTask): Promise<CrmProjectTask>;
  updateProjectTask(id: string, data: Partial<InsertCrmProjectTask>): Promise<CrmProjectTask | undefined>;
  deleteProjectTask(id: string): Promise<boolean>;

  // Task Management
  getTaskTypes(): Promise<TaskType[]>;
  getTaskTypeById(id: string): Promise<TaskType | null>;
  createTaskType(data: InsertTaskType): Promise<TaskType>;
  updateTaskType(id: string, data: Partial<InsertTaskType>): Promise<TaskType | null>;
  deleteTaskType(id: string): Promise<boolean>;

  getTasks(filters?: {
    assignedToUserId?: string;
    createdByUserId?: string;
    status?: string;
    typeId?: string;
    priority?: string;
    dueDateStart?: Date;
    dueDateEnd?: Date;
    overdue?: boolean;
    relatedEntityType?: string;
    relatedEntityId?: string;
    customerId?: string;
    searchText?: string;
    limit?: number;
    offset?: number;
  }): Promise<Task[]>;
  getTaskById(id: string): Promise<Task | null>;
  createTask(data: InsertTask): Promise<Task>;
  updateTask(id: string, data: Partial<InsertTask>): Promise<Task | null>;
  deleteTask(id: string): Promise<boolean>;
  getTasksByCustomer(customerId: string): Promise<Task[]>;
  getTasksByRelatedEntity(entityType: string, entityId: string): Promise<Task[]>;

  createTaskActivity(data: InsertTaskActivity): Promise<TaskActivity>;
  getTaskActivities(taskId: string): Promise<TaskActivity[]>;

  // Task Subtasks
  getSubtasksByTaskId(taskId: string): Promise<TaskSubtask[]>;
  getSubtaskById(id: string): Promise<TaskSubtask | null>;
  createSubtask(data: InsertTaskSubtask): Promise<TaskSubtask>;
  updateSubtask(id: string, data: Partial<InsertTaskSubtask>): Promise<TaskSubtask | null>;
  deleteSubtask(id: string): Promise<boolean>;
  getSubtasksWithDueDate(startDate: Date, endDate: Date): Promise<(TaskSubtask & { taskTitle: string })[]>;

  // Proposal Template operations
  getAllProposalTemplates(): Promise<ProposalTemplate[]>;
  getProposalTemplate(id: string): Promise<ProposalTemplate | undefined>;
  createProposalTemplate(data: InsertProposalTemplate): Promise<ProposalTemplate>;
  updateProposalTemplate(id: string, data: Partial<InsertProposalTemplate>): Promise<ProposalTemplate | undefined>;
  deleteProposalTemplate(id: string): Promise<boolean>;
  getAllProposalTemplateImages(): Promise<ProposalTemplateImage[]>;
  createProposalTemplateImage(data: InsertProposalTemplateImage): Promise<ProposalTemplateImage>;
  deleteProposalTemplateImage(id: string): Promise<boolean>;

  getCustomerFiles(customerId: string): Promise<CustomerFile[]>;
  createCustomerFile(data: InsertCustomerFile): Promise<CustomerFile>;
  deleteCustomerFile(id: string, customerId?: string): Promise<boolean>;

  // Rebate Programs
  getRebateCases(filters?: { search?: string; status?: string; programType?: string; assignedToUserId?: string }): Promise<RebateCase[]>;
  getRebateCase(id: string): Promise<RebateCase | undefined>;
  getRebateCasesWithProgress(filters?: { search?: string; status?: string; programType?: string; assignedToUserId?: string }): Promise<Array<RebateCase & { workflowCompleted: number; workflowTotal: number; currentStep: RebateWorkflowStep | null }>>;
  createRebateCase(data: InsertRebateCase): Promise<RebateCase>;
  updateRebateCase(id: string, data: Partial<RebateCase>): Promise<RebateCase | undefined>;
  deleteRebateCase(id: string): Promise<boolean>;
  getRebateCaseWorkflowSteps(caseId: string): Promise<RebateCaseWorkflowStep[]>;
  updateRebateCaseWorkflowStep(id: string, caseId: string, data: Partial<RebateCaseWorkflowStep>): Promise<RebateCaseWorkflowStep | undefined>;
  getRebateCaseScopeChecklist(caseId: string): Promise<RebateCaseScopeChecklist[]>;
  createRebateScopeItem(data: InsertRebateCaseScopeChecklist): Promise<RebateCaseScopeChecklist>;
  updateRebateScopeItem(id: string, caseId: string, data: Partial<RebateCaseScopeChecklist>): Promise<RebateCaseScopeChecklist | undefined>;
  deleteRebateScopeItem(id: string, caseId: string): Promise<boolean>;
  getRebateCaseDocuments(caseId: string): Promise<RebateCaseDocument[]>;
  createRebateCaseDocument(data: InsertRebateCaseDocument): Promise<RebateCaseDocument>;
  deleteRebateCaseDocument(id: string, caseId: string): Promise<boolean>;
  getRebateCaseActivity(caseId: string): Promise<RebateCaseActivityLog[]>;
  logRebateCaseActivity(data: InsertRebateCaseActivityLog): Promise<RebateCaseActivityLog>;
}

// Old MemStorage removed - now using DatabaseStorage with persistent PostgreSQL

export class DatabaseStorage implements IStorage {
  // Quote operations
  async getQuote(id: string): Promise<Quote | undefined> {
    const [quote] = await db.select().from(quotes).where(eq(quotes.id, id));
    return quote || undefined;
  }

  async getAllQuotes(): Promise<Quote[]> {
    const allQuotes = await db.select().from(quotes).orderBy(quotes.createdAt);
    return allQuotes.reverse(); // Most recent first
  }

  async createQuote(insertQuote: InsertQuote): Promise<Quote> {
    const [quote] = await db
      .insert(quotes)
      .values(insertQuote)
      .returning();
    return quote;
  }

  async updateQuote(id: string, updateData: Partial<Quote>): Promise<Quote | undefined> {
    const [quote] = await db
      .update(quotes)
      .set(updateData)
      .where(eq(quotes.id, id))
      .returning();
    return quote || undefined;
  }

  async deleteQuote(id: string): Promise<boolean> {
    const result = await db.delete(quotes).where(eq(quotes.id, id));
    return (result.rowCount || 0) > 0;
  }

  // Part operations
  async getPart(id: string): Promise<PartData | undefined> {
    const [part] = await db.select().from(parts).where(eq(parts.id, id));
    return part || undefined;
  }

  async getAllParts(): Promise<PartData[]> {
    return await db.select().from(parts);
  }

  async getPartsByCategory(category: string): Promise<PartData[]> {
    return await db.select().from(parts).where(eq(parts.category, category));
  }

  async createPart(insertPart: InsertPart): Promise<PartData> {
    const [part] = await db
      .insert(parts)
      .values(insertPart)
      .returning();
    return part;
  }

  // Technician operations
  async getTechnician(id: string): Promise<Technician | undefined> {
    const [technician] = await db.select().from(technicians).where(eq(technicians.id, id));
    return technician || undefined;
  }

  async getAllTechnicians(): Promise<Technician[]> {
    return await db.select().from(technicians);
  }

  async createTechnician(insertTechnician: InsertTechnician): Promise<Technician> {
    const [technician] = await db
      .insert(technicians)
      .values(insertTechnician)
      .returning();
    return technician;
  }

  async deleteTechnician(id: string): Promise<boolean> {
    const result = await db.delete(technicians).where(eq(technicians.id, id));
    return (result.rowCount || 0) > 0;
  }

  // Process operations
  async getProcess(id: string): Promise<Process | undefined> {
    const [process] = await db.select().from(processes).where(eq(processes.id, id));
    return process || undefined;
  }

  async getAllProcesses(): Promise<Process[]> {
    const allProcesses = await db.select().from(processes).orderBy(processes.createdAt);
    return allProcesses.reverse(); // Most recent first
  }

  async getProcessesByCategory(category: string): Promise<Process[]> {
    return await db.select().from(processes).where(eq(processes.category, category));
  }

  async createProcess(insertProcess: InsertProcess): Promise<Process> {
    const [process] = await db
      .insert(processes)
      .values(insertProcess)
      .returning();
    return process;
  }

  async updateProcess(id: string, updateData: Partial<Process>): Promise<Process | undefined> {
    const [process] = await db
      .update(processes)
      .set(updateData)
      .where(eq(processes.id, id))
      .returning();
    return process || undefined;
  }

  async deleteProcess(id: string): Promise<boolean> {
    // First delete all attachments for this process
    await db.delete(processAttachments).where(eq(processAttachments.processId, id));
    // Then delete the process itself
    const result = await db.delete(processes).where(eq(processes.id, id));
    return (result.rowCount || 0) > 0;
  }

  // Process Attachment operations
  async getProcessAttachment(id: string): Promise<ProcessAttachment | undefined> {
    const [attachment] = await db.select().from(processAttachments).where(eq(processAttachments.id, id));
    return attachment || undefined;
  }

  async getProcessAttachments(processId: string): Promise<ProcessAttachment[]> {
    return await db.select().from(processAttachments)
      .where(eq(processAttachments.processId, processId))
      .orderBy(processAttachments.displayOrder);
  }

  async createProcessAttachment(insertAttachment: InsertProcessAttachment): Promise<ProcessAttachment> {
    const [attachment] = await db
      .insert(processAttachments)
      .values(insertAttachment)
      .returning();
    return attachment;
  }

  async deleteProcessAttachment(id: string): Promise<boolean> {
    const result = await db.delete(processAttachments).where(eq(processAttachments.id, id));
    return (result.rowCount || 0) > 0;
  }

  async updateAttachmentOrder(id: string, displayOrder: string): Promise<ProcessAttachment | undefined> {
    const [attachment] = await db
      .update(processAttachments)
      .set({ displayOrder })
      .where(eq(processAttachments.id, id))
      .returning();
    return attachment || undefined;
  }

  // Category operations
  async getAllCategories(): Promise<Category[]> {
    const allCategories = await db.select().from(categories).orderBy(categories.order);
    return allCategories;
  }

  async createCategory(insertCategory: InsertCategory): Promise<Category> {
    const [category] = await db
      .insert(categories)
      .values(insertCategory)
      .returning();
    return category;
  }

  async updateCategory(id: string, updateData: Partial<Category>): Promise<Category | undefined> {
    const [category] = await db
      .update(categories)
      .set(updateData)
      .where(eq(categories.id, id))
      .returning();
    return category || undefined;
  }

  async deleteCategory(id: string): Promise<boolean> {
    const result = await db.delete(categories).where(eq(categories.id, id));
    return (result.rowCount || 0) > 0;
  }

  // Settings operations
  async getSetting(key: string): Promise<Setting | undefined> {
    const [setting] = await db.select().from(settings).where(eq(settings.key, key));
    return setting || undefined;
  }

  async getAllSettings(): Promise<Setting[]> {
    return await db.select().from(settings);
  }

  async setSetting(key: string, value: string): Promise<Setting> {
    const existing = await this.getSetting(key);
    
    if (existing) {
      const [updated] = await db
        .update(settings)
        .set({ value, updatedAt: new Date() })
        .where(eq(settings.key, key))
        .returning();
      return updated;
    } else {
      const [created] = await db
        .insert(settings)
        .values({ key, value })
        .returning();
      return created;
    }
  }

  async deleteSetting(key: string): Promise<boolean> {
    const result = await db.delete(settings).where(eq(settings.key, key));
    return (result.rowCount || 0) > 0;
  }

  async updateSetting(key: string, value: string): Promise<Setting> {
    return this.setSetting(key, value);
  }

  // PDF File operations
  async getPriceBookPdf(): Promise<PdfFile | undefined> {
    const [pdf] = await db.select().from(pdfFiles).orderBy(pdfFiles.uploadedAt).limit(1);
    return pdf || undefined;
  }

  async getAllPdfFiles(): Promise<PdfFile[]> {
    return await db.select().from(pdfFiles).orderBy(pdfFiles.uploadedAt);
  }

  async uploadPriceBookPdf(pdfData: InsertPdfFile): Promise<PdfFile> {
    // Delete existing price book PDF first (we only want one at a time)
    await db.delete(pdfFiles);
    
    const [pdf] = await db
      .insert(pdfFiles)
      .values(pdfData)
      .returning();
    return pdf;
  }

  async deletePriceBookPdf(): Promise<boolean> {
    const result = await db.delete(pdfFiles);
    return (result.rowCount || 0) > 0;
  }

  async createPdfFile(pdfData: InsertPdfFile): Promise<PdfFile> {
    return this.uploadPriceBookPdf(pdfData);
  }

  // Announcement operations
  async getActiveAnnouncement(): Promise<Announcement | undefined> {
    const [announcement] = await db
      .select()
      .from(announcements)
      .where(eq(announcements.isActive, true))
      .limit(1);
    return announcement || undefined;
  }

  async getAllAnnouncements(): Promise<Announcement[]> {
    return await db.select().from(announcements).orderBy(announcements.createdAt);
  }

  async createAnnouncement(insertAnnouncement: InsertAnnouncement): Promise<Announcement> {
    // Deactivate all existing announcements
    await db.update(announcements).set({ isActive: false });
    
    // Get the highest version number and increment
    const allAnnouncements = await this.getAllAnnouncements();
    const maxVersion = allAnnouncements.length > 0 
      ? Math.max(...allAnnouncements.map(a => parseInt(a.version) || 0))
      : 0;
    
    const [announcement] = await db
      .insert(announcements)
      .values({
        ...insertAnnouncement,
        version: String(maxVersion + 1),
        isActive: true,
      })
      .returning();
    return announcement;
  }

  async updateAnnouncement(id: string, updateData: Partial<Announcement>): Promise<Announcement | undefined> {
    const [announcement] = await db
      .update(announcements)
      .set({ ...updateData, updatedAt: new Date() })
      .where(eq(announcements.id, id))
      .returning();
    return announcement || undefined;
  }

  async deleteAnnouncement(id: string): Promise<boolean> {
    const result = await db.delete(announcements).where(eq(announcements.id, id));
    return (result.rowCount || 0) > 0;
  }

  // Phone Whitelist operations
  async getPhoneWhitelistEntry(phoneNumber: string): Promise<PhoneWhitelist | undefined> {
    const [entry] = await db
      .select()
      .from(phoneWhitelist)
      .where(eq(phoneWhitelist.phoneNumber, phoneNumber));
    return entry || undefined;
  }

  async getAllPhoneWhitelist(): Promise<PhoneWhitelist[]> {
    return await db.select().from(phoneWhitelist).orderBy(phoneWhitelist.createdAt);
  }

  async createPhoneWhitelistEntry(insertEntry: InsertPhoneWhitelist): Promise<PhoneWhitelist> {
    const [entry] = await db
      .insert(phoneWhitelist)
      .values(insertEntry)
      .returning();
    return entry;
  }

  async deletePhoneWhitelistEntry(id: string): Promise<boolean> {
    const result = await db.delete(phoneWhitelist).where(eq(phoneWhitelist.id, id));
    return (result.rowCount || 0) > 0;
  }

  // Auth Token operations
  async createAuthToken(insertToken: InsertAuthToken): Promise<AuthToken> {
    const [token] = await db
      .insert(authTokens)
      .values(insertToken)
      .returning();
    return token;
  }

  async getAuthToken(token: string): Promise<AuthToken | undefined> {
    const [authToken] = await db
      .select()
      .from(authTokens)
      .where(eq(authTokens.token, token));
    return authToken || undefined;
  }

  async deleteAuthToken(token: string): Promise<boolean> {
    const result = await db.delete(authTokens).where(eq(authTokens.token, token));
    return (result.rowCount || 0) > 0;
  }

  async deleteExpiredTokens(): Promise<number> {
    const result = await db.delete(authTokens).where(eq(authTokens.expiresAt, new Date()));
    return result.rowCount || 0;
  }

  // Lead Management operations
  // Helper to normalize lead data (coerce booleans from database strings)
  private normalizeLead(lead: any): Lead {
    return {
      ...lead,
      won: Boolean(lead.won),
      lost: Boolean(lead.lost),
    };
  }

  async getLead(id: string): Promise<Lead | undefined> {
    const [lead] = await db.select().from(leads).where(eq(leads.id, id));
    return lead ? this.normalizeLead(lead) : undefined;
  }

  async getAllLeads(): Promise<Lead[]> {
    const allLeads = await db.select().from(leads).orderBy(leads.createdAt);
    return allLeads.reverse().map(lead => this.normalizeLead(lead)); // Most recent first
  }

  async getLeadsByStatus(status: string): Promise<Lead[]> {
    const result = await db
      .select()
      .from(leads)
      .where(and(eq(leads.status, status), eq(leads.won, false), eq(leads.lost, false)))
      .orderBy(leads.createdAt);
    return result.map(lead => this.normalizeLead(lead));
  }

  async getActiveLeads(): Promise<Lead[]> {
    const result = await db
      .select()
      .from(leads)
      .where(and(eq(leads.won, false), eq(leads.lost, false)))
      .orderBy(leads.createdAt);
    return result.map(lead => this.normalizeLead(lead));
  }

  async getWonLeads(): Promise<Lead[]> {
    // Check both won boolean AND status field for data consistency
    const result = await db
      .select()
      .from(leads)
      .where(or(eq(leads.won, true), eq(leads.status, "Won")))
      .orderBy(leads.closedAt);
    return result.map(lead => this.normalizeLead(lead));
  }

  async getLostLeads(): Promise<Lead[]> {
    const result = await db
      .select()
      .from(leads)
      .where(eq(leads.lost, true))
      .orderBy(leads.closedAt);
    return result.map(lead => this.normalizeLead(lead));
  }

  async createLead(insertLead: InsertLead): Promise<Lead> {
    const [lead] = await db
      .insert(leads)
      .values(insertLead)
      .returning();
    return this.normalizeLead(lead);
  }

  async updateLead(id: string, updateData: Partial<Lead>): Promise<Lead | undefined> {
    const [lead] = await db
      .update(leads)
      .set(updateData)
      .where(eq(leads.id, id))
      .returning();
    return lead ? this.normalizeLead(lead) : undefined;
  }

  async deleteLead(id: string): Promise<boolean> {
    const result = await db.delete(leads).where(eq(leads.id, id));
    return (result.rowCount || 0) > 0;
  }

  async findDuplicateLead(phone?: string, email?: string, externalId?: string): Promise<Lead | undefined> {
    const conditions = [];
    
    // Primary: Match by externalId if provided
    if (externalId) {
      conditions.push(eq(leads.externalId, externalId));
    }
    
    // Secondary: Match by phone (normalized)
    if (phone) {
      const normalizedPhone = phone.replace(/\D/g, ''); // Remove all non-digits
      if (normalizedPhone) {
        conditions.push(eq(leads.phone, phone));
      }
    }
    
    // Tertiary: Match by email
    if (email) {
      conditions.push(eq(leads.email, email.toLowerCase()));
    }
    
    if (conditions.length === 0) {
      return undefined;
    }
    
    // Find lead matching any of the conditions
    const [lead] = await db
      .select()
      .from(leads)
      .where(or(...conditions))
      .limit(1);
    
    return lead ? this.normalizeLead(lead) : undefined;
  }

  // Service Pipeline operations
  async getServiceLeads(): Promise<Lead[]> {
    const result = await db
      .select()
      .from(leads)
      .orderBy(leads.serviceOrder);
    return result
      .filter(lead => {
        // Must be a won lead with a service step
        if (!lead.serviceStep) return false;
        
        // Check if it's a service lead by tag OR job type
        const hasServiceTag = lead.tags && Array.isArray(lead.tags) && 
          lead.tags.some((tag: string) => tag.toLowerCase() === 'service');
        const isServiceJobType = lead.jobType && lead.jobType.toLowerCase() === 'service';
        
        return hasServiceTag || isServiceJobType;
      })
      .map(lead => this.normalizeLead(lead));
  }

  async updateServiceLead(id: string, updates: Partial<Lead>): Promise<Lead | undefined> {
    // Build the set object, explicitly including null values
    const setData: Record<string, any> = { updatedAt: new Date() };
    for (const key of Object.keys(updates)) {
      const value = (updates as any)[key];
      setData[key] = value;
    }
    
    const [lead] = await db
      .update(leads)
      .set(setData)
      .where(eq(leads.id, id))
      .returning();
    
    return lead ? this.normalizeLead(lead) : undefined;
  }

  // Lead History operations
  async createLeadHistory(insertHistory: InsertLeadHistory): Promise<LeadHistory> {
    const [history] = await db
      .insert(leadHistory)
      .values(insertHistory)
      .returning();
    return history;
  }

  async getLeadHistory(leadId: string): Promise<LeadHistory[]> {
    const history = await db
      .select()
      .from(leadHistory)
      .where(eq(leadHistory.leadId, leadId))
      .orderBy(leadHistory.createdAt);
    return history.reverse(); // Most recent first
  }

  // Import Batch operations
  async createImportBatch(insertBatch: InsertImportBatch): Promise<ImportBatch> {
    const [batch] = await db
      .insert(importBatches)
      .values(insertBatch)
      .returning();
    return batch;
  }

  async getImportBatch(id: string): Promise<ImportBatch | undefined> {
    const [batch] = await db.select().from(importBatches).where(eq(importBatches.id, id));
    return batch || undefined;
  }

  async getAllImportBatches(): Promise<ImportBatch[]> {
    return await db.select().from(importBatches).orderBy(importBatches.importedAt);
  }

  // Customer Database operations (FieldEdge imports)
  async getCustomer(id: string): Promise<Customer | undefined> {
    const [customer] = await db.select().from(customers).where(eq(customers.id, id));
    return customer || undefined;
  }

  async getAllCustomers(): Promise<Customer[]> {
    return await db.select().from(customers).orderBy(customers.displayName);
  }

  async searchCustomers(term: string, searchAll: boolean = false): Promise<Customer[]> {
    if (!term || term.trim().length < 2) {
      return [];
    }
    const searchTerm = `%${term.trim()}%`;
    
    // Default: search by name only. If searchAll is true, also search phone, email, address
    const whereCondition = searchAll
      ? or(
          ilike(customers.displayName, searchTerm),
          ilike(customers.email, searchTerm),
          ilike(customers.fullAddress, searchTerm),
          ilike(customers.phone, searchTerm)
        )
      : ilike(customers.displayName, searchTerm);
    
    const results = await db
      .select()
      .from(customers)
      .where(whereCondition)
      .limit(50);
    return results;
  }

  async createCustomer(insertCustomer: InsertCustomer): Promise<Customer> {
    const [customer] = await db
      .insert(customers)
      .values(insertCustomer)
      .returning();
    return customer;
  }

  async updateCustomer(id: string, updateData: Partial<Customer>): Promise<Customer | undefined> {
    const [customer] = await db
      .update(customers)
      .set({ ...updateData, lastSyncedAt: new Date() })
      .where(eq(customers.id, id))
      .returning();
    return customer || undefined;
  }

  async getCustomerByChecksum(checksum: string): Promise<Customer | undefined> {
    const [customer] = await db
      .select()
      .from(customers)
      .where(eq(customers.checksum, checksum));
    return customer || undefined;
  }

  async upsertCustomerByChecksum(insertCustomer: InsertCustomer): Promise<{ action: 'created' | 'updated' | 'skipped'; customer: Customer }> {
    // If no checksum, just create
    if (!insertCustomer.checksum) {
      const customer = await this.createCustomer(insertCustomer);
      return { action: 'created', customer };
    }

    // Check for existing customer with same checksum (no changes needed)
    const existingByChecksum = await this.getCustomerByChecksum(insertCustomer.checksum);
    if (existingByChecksum) {
      return { action: 'skipped', customer: existingByChecksum };
    }

    // Look for existing customer by displayName + address to update
    const existing = await db
      .select()
      .from(customers)
      .where(
        and(
          eq(customers.displayName, insertCustomer.displayName),
          insertCustomer.fullAddress 
            ? eq(customers.fullAddress, insertCustomer.fullAddress)
            : sql`${customers.fullAddress} IS NULL`
        )
      )
      .limit(1);

    if (existing.length > 0) {
      // Update existing customer
      const updated = await this.updateCustomer(existing[0].id, {
        ...insertCustomer,
        lastSyncedAt: new Date(),
      });
      return { action: 'updated', customer: updated! };
    }

    // Create new customer
    const customer = await this.createCustomer(insertCustomer);
    return { action: 'created', customer };
  }

  async batchImportCustomers(customerList: InsertCustomer[]): Promise<{ created: number; updated: number; skipped: number; errors: number }> {
    if (customerList.length === 0) {
      return { created: 0, updated: 0, skipped: 0, errors: 0 };
    }

    let created = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;

    // Step 1: Get all existing checksums in one query for fast lookup
    const existingCustomers = await db.select({
      id: customers.id,
      checksum: customers.checksum,
      displayName: customers.displayName,
      fullAddress: customers.fullAddress,
    }).from(customers);

    // Build lookup maps
    const checksumMap = new Map<string, string>(); // checksum -> id
    const nameAddressMap = new Map<string, string>(); // "name|address" -> id
    
    for (const c of existingCustomers) {
      if (c.checksum) {
        checksumMap.set(c.checksum, c.id);
      }
      nameAddressMap.set(`${c.displayName}|${c.fullAddress || ''}`, c.id);
    }

    // Step 2: Categorize records
    const toCreate: InsertCustomer[] = [];
    const toUpdate: { id: string; data: InsertCustomer }[] = [];

    for (const customer of customerList) {
      try {
        if (!customer.displayName) {
          skipped++;
          continue;
        }

        // Check if identical checksum exists (skip)
        if (customer.checksum && checksumMap.has(customer.checksum)) {
          skipped++;
          continue;
        }

        // Check if customer exists by name+address (update)
        const key = `${customer.displayName}|${customer.fullAddress || ''}`;
        const existingId = nameAddressMap.get(key);
        
        if (existingId) {
          toUpdate.push({ id: existingId, data: customer });
        } else {
          toCreate.push(customer);
        }
      } catch (e) {
        errors++;
      }
    }

    // Step 3: Batch insert new customers (in chunks of 100)
    const BATCH_SIZE = 100;
    for (let i = 0; i < toCreate.length; i += BATCH_SIZE) {
      const batch = toCreate.slice(i, i + BATCH_SIZE);
      try {
        await db.insert(customers).values(batch);
        created += batch.length;
      } catch (e) {
        // If batch fails, try individual inserts
        for (const customer of batch) {
          try {
            await db.insert(customers).values(customer);
            created++;
          } catch (innerE) {
            errors++;
          }
        }
      }
    }

    // Step 4: Update existing customers - only update sheet-sourced fields, preserve CRM-only data
    for (const { id, data } of toUpdate) {
      try {
        await db.update(customers)
          .set({
            displayName: data.displayName,
            customerType: data.customerType,
            customerStatus: data.customerStatus,
            fullAddress: data.fullAddress,
            phone: data.phone,
            email: data.email,
            leadSource: data.leadSource,
            checksum: data.checksum,
            lastSyncedAt: new Date(),
          })
          .where(eq(customers.id, id));
        updated++;
      } catch (e) {
        errors++;
      }
    }

    return { created, updated, skipped, errors };
  }

  async deleteCustomersNotInChecksums(checksums: string[]): Promise<number> {
    if (checksums.length === 0) {
      return 0;
    }

    const result = await db
      .delete(customers)
      .where(notInArray(customers.checksum, checksums));
    
    return result.rowCount || 0;
  }

  // Customer Import Batch operations
  async createCustomerImportBatch(insertBatch: InsertCustomerImportBatch): Promise<CustomerImportBatch> {
    const [batch] = await db
      .insert(customerImportBatches)
      .values(insertBatch)
      .returning();
    return batch;
  }

  async updateCustomerImportBatch(id: string, updateData: Partial<CustomerImportBatch>): Promise<CustomerImportBatch | undefined> {
    const [batch] = await db
      .update(customerImportBatches)
      .set(updateData)
      .where(eq(customerImportBatches.id, id))
      .returning();
    return batch || undefined;
  }

  async getCustomerImportBatch(id: string): Promise<CustomerImportBatch | undefined> {
    const [batch] = await db
      .select()
      .from(customerImportBatches)
      .where(eq(customerImportBatches.id, id));
    return batch || undefined;
  }

  async getCustomerImportBatchByFileHash(fileHash: string): Promise<CustomerImportBatch | undefined> {
    const [batch] = await db
      .select()
      .from(customerImportBatches)
      .where(eq(customerImportBatches.fileHash, fileHash));
    return batch || undefined;
  }

  async getAllCustomerImportBatches(): Promise<CustomerImportBatch[]> {
    const batches = await db
      .select()
      .from(customerImportBatches)
      .orderBy(customerImportBatches.importedAt);
    return batches.reverse(); // Most recent first
  }

  // Backup operations
  async clearAllData(): Promise<void> {
    // Clear all tables except sessions (preserve active sessions)
    await db.delete(customerImportBatches);
    await db.delete(customers);
    await db.delete(importBatches);
    await db.delete(leadHistory);
    await db.delete(leads);
    await db.delete(authTokens);
    await db.delete(phoneWhitelist);
    await db.delete(announcements);
    await db.delete(pdfFiles);
    await db.delete(settings);
    await db.delete(processes);
    await db.delete(quotes);
    await db.delete(technicians);
    await db.delete(parts);
    await db.delete(categories);
  }

  // Quote Conversation operations (AI memory)
  async createQuoteConversation(conversation: InsertQuoteConversation): Promise<QuoteConversation> {
    const [created] = await db
      .insert(quoteConversations)
      .values(conversation)
      .returning();
    return created;
  }

  async getQuoteConversation(id: string): Promise<QuoteConversation | undefined> {
    const [conversation] = await db
      .select()
      .from(quoteConversations)
      .where(eq(quoteConversations.id, id));
    return conversation || undefined;
  }

  async updateQuoteConversation(id: string, updates: Partial<QuoteConversation>): Promise<QuoteConversation | undefined> {
    const [updated] = await db
      .update(quoteConversations)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(quoteConversations.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteQuoteConversation(id: string): Promise<boolean> {
    await db.delete(quoteMessages).where(eq(quoteMessages.conversationId, id));
    const result = await db.delete(quoteConversations).where(eq(quoteConversations.id, id));
    return true;
  }

  // Quote Message operations
  async createQuoteMessage(message: InsertQuoteMessage): Promise<QuoteMessage> {
    const [created] = await db
      .insert(quoteMessages)
      .values(message)
      .returning();
    return created;
  }

  async getQuoteMessages(conversationId: string, limit?: number): Promise<QuoteMessage[]> {
    let query = db
      .select()
      .from(quoteMessages)
      .where(eq(quoteMessages.conversationId, conversationId))
      .orderBy(quoteMessages.createdAt);
    
    const messages = await query;
    return limit ? messages.slice(-limit) : messages;
  }

  async getRecentQuoteMessages(conversationId: string, limit: number = 10): Promise<QuoteMessage[]> {
    const messages = await db
      .select()
      .from(quoteMessages)
      .where(eq(quoteMessages.conversationId, conversationId))
      .orderBy(quoteMessages.createdAt);
    
    return messages.slice(-limit);
  }

  // Voicemail operations (Trello webhook integration)
  async getVoicemail(id: string): Promise<Voicemail | undefined> {
    const [voicemail] = await db.select().from(voicemails).where(eq(voicemails.id, id));
    return voicemail || undefined;
  }

  async getAllVoicemails(): Promise<Voicemail[]> {
    return await db.select().from(voicemails).orderBy(desc(voicemails.receivedAt));
  }

  async getVoicemailsByStatus(status: string): Promise<Voicemail[]> {
    return await db.select().from(voicemails).where(eq(voicemails.status, status)).orderBy(desc(voicemails.receivedAt));
  }

  async getVoicemailByTrelloCardId(trelloCardId: string): Promise<Voicemail | undefined> {
    const [voicemail] = await db.select().from(voicemails).where(eq(voicemails.trelloCardId, trelloCardId));
    return voicemail || undefined;
  }

  async upsertVoicemail(data: InsertVoicemail): Promise<Voicemail> {
    const existing = await this.getVoicemailByTrelloCardId(data.trelloCardId);
    
    if (existing) {
      const [updated] = await db
        .update(voicemails)
        .set({ 
          ...data, 
          mp3Filename: data.mp3Filename || existing.mp3Filename,
          updatedAt: new Date() 
        })
        .where(eq(voicemails.trelloCardId, data.trelloCardId))
        .returning();
      return updated;
    } else {
      const [created] = await db
        .insert(voicemails)
        .values(data)
        .returning();
      return created;
    }
  }

  async updateVoicemail(id: string, updates: Partial<Voicemail>): Promise<Voicemail | undefined> {
    const [updated] = await db
      .update(voicemails)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(voicemails.id, id))
      .returning();
    return updated || undefined;
  }

  async updateVoicemailMp3(trelloCardId: string, mp3Filename: string): Promise<Voicemail | undefined> {
    const [updated] = await db
      .update(voicemails)
      .set({ mp3Filename, updatedAt: new Date() })
      .where(eq(voicemails.trelloCardId, trelloCardId))
      .returning();
    return updated || undefined;
  }

  // Saved Proposals operations
  async getAllSavedProposals(): Promise<SavedProposal[]> {
    return await db.select().from(savedProposals).orderBy(savedProposals.createdAt);
  }

  async getSavedProposal(id: string): Promise<SavedProposal | undefined> {
    const [proposal] = await db.select().from(savedProposals).where(eq(savedProposals.id, id));
    return proposal || undefined;
  }

  async createSavedProposal(proposal: InsertSavedProposal): Promise<SavedProposal> {
    const [created] = await db.insert(savedProposals).values(proposal).returning();
    return created;
  }

  async updateSavedProposal(id: string, updates: Partial<SavedProposal>): Promise<SavedProposal | undefined> {
    const [updated] = await db
      .update(savedProposals)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(savedProposals.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteSavedProposal(id: string): Promise<boolean> {
    const result = await db.delete(savedProposals).where(eq(savedProposals.id, id)).returning();
    return result.length > 0;
  }

  // Call Log operations
  async getCallLogDays(): Promise<{ id: string; date: string; count: number }[]> {
    const days = await db.select().from(callLogDays).orderBy(desc(callLogDays.date));
    const result = [];
    for (const day of days) {
      const logs = await db.select().from(callLogs).where(eq(callLogs.dayId, day.id));
      result.push({ id: day.id, date: day.date, count: logs.length });
    }
    return result;
  }

  async getOrCreateCallLogDay(date: string): Promise<CallLogDay> {
    const [existing] = await db.select().from(callLogDays).where(eq(callLogDays.date, date));
    if (existing) return existing;
    
    const [created] = await db.insert(callLogDays).values({ date }).returning();
    return created;
  }

  async getCallLogsByDay(date: string): Promise<CallLog[]> {
    const [day] = await db.select().from(callLogDays).where(eq(callLogDays.date, date));
    if (!day) return [];
    
    return await db.select().from(callLogs).where(eq(callLogs.dayId, day.id)).orderBy(desc(callLogs.createdAt));
  }

  async createCallLog(data: InsertCallLog): Promise<CallLog> {
    const [created] = await db.insert(callLogs).values(data).returning();
    return created;
  }

  async updateCallLog(id: string, data: Partial<InsertCallLog>): Promise<CallLog | undefined> {
    const [updated] = await db
      .update(callLogs)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(callLogs.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteCallLog(id: string): Promise<boolean> {
    const result = await db.delete(callLogs).where(eq(callLogs.id, id)).returning();
    return result.length > 0;
  }

  async searchCallLogs(query: string): Promise<(CallLog & { date: string })[]> {
    const searchTerm = `%${query}%`;
    const logs = await db
      .select({
        id: callLogs.id,
        dayId: callLogs.dayId,
        clientName: callLogs.clientName,
        description: callLogs.description,
        phone: callLogs.phone,
        tag: callLogs.tag,
        billable: callLogs.billable,
        createdByUserId: callLogs.createdByUserId,
        createdByName: callLogs.createdByName,
        createdAt: callLogs.createdAt,
        updatedAt: callLogs.updatedAt,
        date: callLogDays.date,
      })
      .from(callLogs)
      .innerJoin(callLogDays, eq(callLogs.dayId, callLogDays.id))
      .where(
        or(
          ilike(callLogs.clientName, searchTerm),
          ilike(callLogs.description, searchTerm),
          ilike(callLogs.phone, searchTerm)
        )
      )
      .orderBy(desc(callLogs.createdAt));
    return logs;
  }

  async getCallLogById(id: string): Promise<CallLog | null> {
    const [log] = await db.select().from(callLogs).where(eq(callLogs.id, id)).limit(1);
    return log || null;
  }

  // Call Log Task operations
  async getTasksByCallLog(callLogId: string): Promise<CallLogTask[]> {
    return await db
      .select()
      .from(callLogTasks)
      .where(eq(callLogTasks.callLogId, callLogId))
      .orderBy(asc(callLogTasks.createdAt));
  }

  async createCallLogTask(data: InsertCallLogTask): Promise<CallLogTask> {
    const [task] = await db.insert(callLogTasks).values(data).returning();
    return task;
  }

  async updateCallLogTask(id: string, data: Partial<InsertCallLogTask>): Promise<CallLogTask | undefined> {
    const updateData: any = { ...data };
    if (data.isCompleted !== undefined) {
      updateData.completedAt = data.isCompleted ? new Date() : null;
    }
    const [task] = await db
      .update(callLogTasks)
      .set(updateData)
      .where(eq(callLogTasks.id, id))
      .returning();
    return task || undefined;
  }

  async deleteCallLogTask(id: string): Promise<boolean> {
    const result = await db.delete(callLogTasks).where(eq(callLogTasks.id, id)).returning();
    return result.length > 0;
  }

  async getTasksByDay(date: string): Promise<(CallLogTask & { callLogId: string })[]> {
    const [day] = await db.select().from(callLogDays).where(eq(callLogDays.date, date));
    if (!day) return [];
    
    const logs = await db.select().from(callLogs).where(eq(callLogs.dayId, day.id));
    if (logs.length === 0) return [];
    
    const logIds = logs.map(l => l.id);
    const tasks = await db
      .select()
      .from(callLogTasks)
      .where(sql`${callLogTasks.callLogId} = ANY(${logIds})`)
      .orderBy(asc(callLogTasks.createdAt));
    return tasks;
  }

  async getCallLogTaskById(id: string): Promise<CallLogTask | null> {
    const [task] = await db.select().from(callLogTasks).where(eq(callLogTasks.id, id)).limit(1);
    return task || null;
  }

  // Portal Users operations
  async getPortalUser(id: string): Promise<PortalUser | undefined> {
    const [user] = await db.select().from(portalUsers).where(eq(portalUsers.id, id));
    return user || undefined;
  }

  async getPortalUserByUsername(username: string): Promise<PortalUser | undefined> {
    const [user] = await db.select().from(portalUsers).where(eq(portalUsers.username, username));
    return user || undefined;
  }

  async getPortalUserByEmail(email: string): Promise<PortalUser | undefined> {
    const [user] = await db.select().from(portalUsers).where(eq(portalUsers.email, email));
    return user || undefined;
  }

  async getAllPortalUsers(): Promise<PortalUser[]> {
    return await db.select().from(portalUsers).orderBy(desc(portalUsers.createdAt));
  }

  async createPortalUser(data: InsertPortalUser): Promise<PortalUser> {
    const [user] = await db.insert(portalUsers).values(data).returning();
    return user;
  }

  async updatePortalUser(id: string, data: Partial<InsertPortalUser>): Promise<PortalUser | undefined> {
    const [user] = await db
      .update(portalUsers)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(portalUsers.id, id))
      .returning();
    return user || undefined;
  }

  async updatePortalUserLastLogin(id: string): Promise<void> {
    await db
      .update(portalUsers)
      .set({ lastLogin: new Date(), updatedAt: new Date() })
      .where(eq(portalUsers.id, id));
  }

  // Employee Profiles operations
  async getEmployeeProfile(userId: string): Promise<EmployeeProfile | undefined> {
    const [profile] = await db.select().from(employeeProfiles).where(eq(employeeProfiles.userId, userId));
    return profile || undefined;
  }

  async getAllEmployeeProfiles(): Promise<EmployeeProfile[]> {
    return await db.select().from(employeeProfiles).orderBy(desc(employeeProfiles.createdAt));
  }

  async createEmployeeProfile(data: InsertEmployeeProfile): Promise<EmployeeProfile> {
    const [profile] = await db.insert(employeeProfiles).values(data).returning();
    return profile;
  }

  async updateEmployeeProfile(userId: string, data: Partial<InsertEmployeeProfile>): Promise<EmployeeProfile | undefined> {
    const [profile] = await db
      .update(employeeProfiles)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(employeeProfiles.userId, userId))
      .returning();
    return profile || undefined;
  }

  // Compensations operations
  async getCurrentCompensation(userId: string): Promise<Compensation | undefined> {
    const today = new Date().toISOString().split('T')[0];
    const allComps = await db
      .select()
      .from(compensations)
      .where(eq(compensations.userId, userId))
      .orderBy(desc(compensations.effectiveDate));
    
    const current = allComps.find(c => !c.endDate || c.endDate >= today);
    return current || undefined;
  }

  async getCompensationHistory(userId: string): Promise<Compensation[]> {
    return await db
      .select()
      .from(compensations)
      .where(eq(compensations.userId, userId))
      .orderBy(desc(compensations.effectiveDate));
  }

  async createCompensation(data: InsertCompensation): Promise<Compensation> {
    const [comp] = await db.insert(compensations).values(data).returning();
    return comp;
  }

  async updateCompensation(id: string, data: Partial<InsertCompensation>): Promise<Compensation | undefined> {
    const [comp] = await db
      .update(compensations)
      .set(data)
      .where(eq(compensations.id, id))
      .returning();
    return comp || undefined;
  }

  // Paystubs operations
  async getPaystubs(userId: string): Promise<Paystub[]> {
    return await db
      .select()
      .from(paystubs)
      .where(eq(paystubs.userId, userId))
      .orderBy(desc(paystubs.payDate));
  }

  async getAllPaystubs(): Promise<Paystub[]> {
    return await db.select().from(paystubs).orderBy(desc(paystubs.payDate));
  }

  async createPaystub(data: InsertPaystub): Promise<Paystub> {
    const [paystub] = await db.insert(paystubs).values(data).returning();
    return paystub;
  }

  async deletePaystub(id: string): Promise<boolean> {
    const result = await db.delete(paystubs).where(eq(paystubs.id, id)).returning();
    return result.length > 0;
  }

  // Compensation Audit Log operations
  async getCompensationAuditLog(userId: string): Promise<CompensationAuditLog[]> {
    return await db
      .select()
      .from(compensationAuditLog)
      .where(eq(compensationAuditLog.userId, userId))
      .orderBy(desc(compensationAuditLog.changedAt));
  }

  async getAllCompensationAuditLogs(): Promise<CompensationAuditLog[]> {
    return await db.select().from(compensationAuditLog).orderBy(desc(compensationAuditLog.changedAt));
  }

  async createCompensationAuditLog(data: InsertCompensationAuditLog): Promise<CompensationAuditLog> {
    const [log] = await db.insert(compensationAuditLog).values(data).returning();
    return log;
  }

  // Employee Documents operations
  async getEmployeeDocuments(userId: string | null): Promise<EmployeeDocument[]> {
    if (userId === null) {
      return await db
        .select()
        .from(employeeDocuments)
        .where(sql`${employeeDocuments.userId} IS NULL`)
        .orderBy(desc(employeeDocuments.createdAt));
    }
    return await db
      .select()
      .from(employeeDocuments)
      .where(eq(employeeDocuments.userId, userId))
      .orderBy(desc(employeeDocuments.createdAt));
  }

  async createEmployeeDocument(data: InsertEmployeeDocument): Promise<EmployeeDocument> {
    const [doc] = await db.insert(employeeDocuments).values(data).returning();
    return doc;
  }

  async deleteEmployeeDocument(id: string): Promise<boolean> {
    const result = await db.delete(employeeDocuments).where(eq(employeeDocuments.id, id)).returning();
    return result.length > 0;
  }

  // Weather Cache operations
  async getWeatherCache(): Promise<WeatherCache | undefined> {
    const [cache] = await db.select().from(weatherCache).where(eq(weatherCache.id, 1));
    return cache || undefined;
  }

  async upsertWeatherCache(data: InsertWeatherCache): Promise<WeatherCache> {
    const existing = await this.getWeatherCache();
    if (existing) {
      const [updated] = await db
        .update(weatherCache)
        .set({ ...data, fetchedAt: new Date() })
        .where(eq(weatherCache.id, 1))
        .returning();
      return updated;
    } else {
      const [created] = await db
        .insert(weatherCache)
        .values({ ...data, id: 1, fetchedAt: new Date() })
        .returning();
      return created;
    }
  }

  // Weather Impact operations
  async upsertCallDaily(date: string, inboundCalls: number): Promise<void> {
    await db
      .insert(callDaily)
      .values({ date, inboundCalls, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: callDaily.date,
        set: { inboundCalls, updatedAt: new Date() },
      });
  }

  async upsertWeatherDaily(date: string, avgTemp: number, maxTemp: number, minTemp: number): Promise<void> {
    const cdd = Math.max(0, avgTemp - 65);
    const hdd = Math.max(0, 65 - avgTemp);
    await db
      .insert(weatherDaily)
      .values({
        date,
        avgTempF: String(avgTemp),
        maxTempF: String(maxTemp),
        minTempF: String(minTemp),
        cdd: String(cdd),
        hdd: String(hdd),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: weatherDaily.date,
        set: {
          avgTempF: String(avgTemp),
          maxTempF: String(maxTemp),
          minTempF: String(minTemp),
          cdd: String(cdd),
          hdd: String(hdd),
          updatedAt: new Date(),
        },
      });
  }

  async getWeatherImpactData(startDate: string, endDate: string): Promise<{date: string, calls: number, hotIndex: number, coldIndex: number, avgTempF: number}[]> {
    const result = await db.execute(sql`
      SELECT 
        c.date,
        c.inbound_calls as calls,
        COALESCE(w.cdd, 0)::numeric as hot_index,
        COALESCE(w.hdd, 0)::numeric as cold_index,
        COALESCE(w.avg_temp_f, 0)::numeric as avg_temp_f
      FROM call_daily c
      LEFT JOIN weather_daily w ON c.date = w.date
      WHERE c.date >= ${startDate} AND c.date <= ${endDate}
      ORDER BY c.date ASC
    `);
    return (result.rows as any[]).map(row => ({
      date: row.date,
      calls: Number(row.calls),
      hotIndex: Number(row.hot_index),
      coldIndex: Number(row.cold_index),
      avgTempF: Number(row.avg_temp_f),
    }));
  }

  // CRM WorkOrder operations
  async createWorkOrder(data: InsertCrmWorkOrder): Promise<CrmWorkOrder> {
    const [workOrder] = await db
      .insert(crmWorkOrders)
      .values(data as typeof crmWorkOrders.$inferInsert)
      .returning();
    return workOrder;
  }

  async getWorkOrder(id: string): Promise<CrmWorkOrder | undefined> {
    const [workOrder] = await db.select().from(crmWorkOrders).where(eq(crmWorkOrders.id, id));
    return workOrder || undefined;
  }

  async getWorkOrdersByJobId(jobId: string): Promise<CrmWorkOrder[]> {
    return await db
      .select()
      .from(crmWorkOrders)
      .where(eq(crmWorkOrders.jobId, jobId))
      .orderBy(asc(crmWorkOrders.workOrderNumber));
  }

  async getWorkOrdersByCustomerId(customerId: string): Promise<CrmWorkOrder[]> {
    return await db
      .select()
      .from(crmWorkOrders)
      .where(eq(crmWorkOrders.customerId, customerId))
      .orderBy(desc(crmWorkOrders.scheduledStart));
  }

  async getWorkOrdersByProjectId(projectId: string): Promise<CrmWorkOrder[]> {
    return await db
      .select()
      .from(crmWorkOrders)
      .where(eq(crmWorkOrders.projectId, projectId))
      .orderBy(asc(crmWorkOrders.scheduledStart));
  }

  async getWorkOrdersByDateRange(startDate: Date, endDate: Date): Promise<CrmWorkOrder[]> {
    return await db
      .select()
      .from(crmWorkOrders)
      .where(
        and(
          gte(crmWorkOrders.scheduledStart, startDate),
          lte(crmWorkOrders.scheduledStart, endDate),
          or(eq(crmWorkOrders.isHistorical, false), isNull(crmWorkOrders.isHistorical))
        )
      )
      .orderBy(asc(crmWorkOrders.scheduledStart));
  }

  async getWorkOrdersByTechId(techId: string, date?: Date): Promise<CrmWorkOrder[]> {
    if (date) {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      
      return await db
        .select()
        .from(crmWorkOrders)
        .where(
          and(
            eq(crmWorkOrders.assignedTechId, techId),
            gte(crmWorkOrders.scheduledStart, startOfDay),
            lte(crmWorkOrders.scheduledStart, endOfDay),
            or(eq(crmWorkOrders.isHistorical, false), isNull(crmWorkOrders.isHistorical))
          )
        )
        .orderBy(asc(crmWorkOrders.scheduledStart));
    }
    
    return await db
      .select()
      .from(crmWorkOrders)
      .where(
        and(
          eq(crmWorkOrders.assignedTechId, techId),
          or(eq(crmWorkOrders.isHistorical, false), isNull(crmWorkOrders.isHistorical))
        )
      )
      .orderBy(asc(crmWorkOrders.scheduledStart));
  }

  async getUnassignedWorkOrders(): Promise<CrmWorkOrder[]> {
    return await db
      .select()
      .from(crmWorkOrders)
      .where(
        and(
          isNull(crmWorkOrders.assignedTechId),
          notInArray(crmWorkOrders.status, ['completed', 'cancelled']),
          or(eq(crmWorkOrders.isHistorical, false), isNull(crmWorkOrders.isHistorical))
        )
      )
      .orderBy(desc(crmWorkOrders.createdAt));
  }

  async getSchedulableWorkOrders(): Promise<CrmWorkOrder[]> {
    return await db
      .select()
      .from(crmWorkOrders)
      .where(
        and(
          isNull(crmWorkOrders.scheduledStart),
          notInArray(crmWorkOrders.status, ['completed', 'cancelled']),
          or(eq(crmWorkOrders.isHistorical, false), isNull(crmWorkOrders.isHistorical))
        )
      )
      .orderBy(desc(crmWorkOrders.createdAt));
  }

  async updateWorkOrder(id: string, data: Partial<InsertCrmWorkOrder>): Promise<CrmWorkOrder | undefined> {
    const [workOrder] = await db
      .update(crmWorkOrders)
      .set({ ...data, updatedAt: new Date() } as Partial<typeof crmWorkOrders.$inferInsert>)
      .where(eq(crmWorkOrders.id, id))
      .returning();
    return workOrder || undefined;
  }

  async deleteWorkOrder(id: string): Promise<boolean> {
    const result = await db.delete(crmWorkOrders).where(eq(crmWorkOrders.id, id));
    return (result.rowCount || 0) > 0;
  }

  // CRM Invoice operations
  async createInvoice(data: InsertCrmInvoice): Promise<CrmInvoice> {
    const [invoice] = await db
      .insert(crmInvoices)
      .values([data])
      .returning();
    return invoice;
  }

  async getInvoice(id: string): Promise<CrmInvoice | undefined> {
    const [invoice] = await db.select().from(crmInvoices).where(eq(crmInvoices.id, id));
    return invoice || undefined;
  }

  async getInvoices(filters?: { jobId?: string; customerId?: string; status?: string; workOrderId?: string }): Promise<CrmInvoice[]> {
    const conditions: ReturnType<typeof eq>[] = [];
    
    if (filters?.jobId) {
      conditions.push(eq(crmInvoices.jobId, filters.jobId));
    }
    if (filters?.customerId) {
      conditions.push(eq(crmInvoices.customerId, filters.customerId));
    }
    if (filters?.status) {
      conditions.push(eq(crmInvoices.status, filters.status as any));
    }
    if (filters?.workOrderId) {
      conditions.push(eq(crmInvoices.workOrderId, filters.workOrderId));
    }
    
    if (conditions.length > 0) {
      return await db.select().from(crmInvoices).where(and(...conditions)).orderBy(desc(crmInvoices.createdAt));
    }
    
    return await db.select().from(crmInvoices).orderBy(desc(crmInvoices.createdAt));
  }

  async getInvoiceWithLineItems(id: string): Promise<{ invoice: CrmInvoice; lineItems: CrmInvoiceLineItem[] } | undefined> {
    const invoice = await this.getInvoice(id);
    if (!invoice) return undefined;
    
    const lineItems = await this.getInvoiceLineItems(id);
    return { invoice, lineItems };
  }

  async updateInvoice(id: string, data: Partial<InsertCrmInvoice>): Promise<CrmInvoice | undefined> {
    const [invoice] = await db
      .update(crmInvoices)
      .set({ ...data, updatedAt: new Date() } as Partial<typeof crmInvoices.$inferInsert>)
      .where(eq(crmInvoices.id, id))
      .returning();
    return invoice || undefined;
  }

  async deleteInvoice(id: string): Promise<boolean> {
    const result = await db.delete(crmInvoices).where(eq(crmInvoices.id, id));
    return (result.rowCount || 0) > 0;
  }

  // CRM Invoice Line Item operations
  async createInvoiceLineItem(data: InsertCrmInvoiceLineItem): Promise<CrmInvoiceLineItem> {
    const [lineItem] = await db
      .insert(crmInvoiceLineItems)
      .values(data)
      .returning();
    return lineItem;
  }

  async getInvoiceLineItems(invoiceId: string): Promise<CrmInvoiceLineItem[]> {
    return await db
      .select()
      .from(crmInvoiceLineItems)
      .where(eq(crmInvoiceLineItems.invoiceId, invoiceId))
      .orderBy(asc(crmInvoiceLineItems.sortOrder));
  }

  async updateInvoiceLineItem(id: string, data: Partial<InsertCrmInvoiceLineItem>): Promise<CrmInvoiceLineItem | undefined> {
    const [lineItem] = await db
      .update(crmInvoiceLineItems)
      .set(data)
      .where(eq(crmInvoiceLineItems.id, id))
      .returning();
    return lineItem || undefined;
  }

  async deleteInvoiceLineItem(id: string): Promise<boolean> {
    const result = await db.delete(crmInvoiceLineItems).where(eq(crmInvoiceLineItems.id, id));
    return (result.rowCount || 0) > 0;
  }

  // CRM Items operations
  async getAllCrmItems(): Promise<CrmItem[]> {
    return await db.select().from(crmItems).where(eq(crmItems.isActive, true)).orderBy(asc(crmItems.name));
  }

  async getCrmItem(id: string): Promise<CrmItem | undefined> {
    const [item] = await db.select().from(crmItems).where(eq(crmItems.id, id));
    return item || undefined;
  }

  async createCrmItem(data: InsertCrmItem): Promise<CrmItem> {
    const [item] = await db.insert(crmItems).values(data).returning();
    return item;
  }

  async updateCrmItem(id: string, data: Partial<InsertCrmItem>): Promise<CrmItem | undefined> {
    const [item] = await db.update(crmItems).set({ ...data, updatedAt: new Date() }).where(eq(crmItems.id, id)).returning();
    return item || undefined;
  }

  async deleteCrmItem(id: string): Promise<boolean> {
    const result = await db.delete(crmItems).where(eq(crmItems.id, id));
    return (result.rowCount || 0) > 0;
  }

  async searchCrmItems(query: string): Promise<CrmItem[]> {
    return await db.select().from(crmItems)
      .where(and(
        eq(crmItems.isActive, true),
        or(
          ilike(crmItems.name, `%${query}%`),
          ilike(crmItems.description, `%${query}%`),
          ilike(crmItems.partNumber, `%${query}%`)
        )
      ))
      .orderBy(asc(crmItems.name));
  }

  // Messaging operations
  async getMessagingConversations(filters?: { status?: string; assignedToId?: string; customerId?: string; search?: string }): Promise<CrmMessagingConversation[]> {
    const conditions: ReturnType<typeof eq>[] = [];
    
    if (filters?.status) {
      conditions.push(sql`${crmMessagingConversations.status} = ${filters.status}`);
    }
    if (filters?.assignedToId) {
      conditions.push(eq(crmMessagingConversations.assignedToId, filters.assignedToId));
    }
    if (filters?.customerId) {
      conditions.push(eq(crmMessagingConversations.customerId, filters.customerId));
    }

    if (filters?.search) {
      const searchResults = await db
        .select({ conversation: crmMessagingConversations })
        .from(crmMessagingConversations)
        .leftJoin(crmCustomers, eq(crmMessagingConversations.customerId, crmCustomers.id))
        .where(
          conditions.length > 0
            ? and(...conditions, ilike(crmCustomers.name, `%${filters.search}%`))
            : ilike(crmCustomers.name, `%${filters.search}%`)
        )
        .orderBy(sql`${crmMessagingConversations.lastMessageAt} DESC NULLS LAST`);
      return searchResults.map(r => r.conversation);
    }

    if (conditions.length === 0) {
      return await db.select().from(crmMessagingConversations).orderBy(sql`${crmMessagingConversations.lastMessageAt} DESC NULLS LAST`);
    }

    return await db.select().from(crmMessagingConversations)
      .where(and(...conditions))
      .orderBy(sql`${crmMessagingConversations.lastMessageAt} DESC NULLS LAST`);
  }

  async getMessagingConversationById(id: string): Promise<CrmMessagingConversation | undefined> {
    const [conversation] = await db.select().from(crmMessagingConversations).where(eq(crmMessagingConversations.id, id));
    return conversation || undefined;
  }

  async createMessagingConversation(conversation: InsertCrmMessagingConversation): Promise<CrmMessagingConversation> {
    const [created] = await db.insert(crmMessagingConversations).values(conversation as any).returning();
    return created;
  }

  async updateMessagingConversation(id: string, updates: Partial<InsertCrmMessagingConversation>): Promise<CrmMessagingConversation | undefined> {
    const [updated] = await db.update(crmMessagingConversations)
      .set({ ...updates, updatedAt: new Date() } as any)
      .where(eq(crmMessagingConversations.id, id))
      .returning();
    return updated || undefined;
  }

  async getMessagesForConversation(conversationId: string): Promise<(CrmMessagingMessage & { authorName?: string | null })[]> {
    const results = await db.select({
      message: crmMessagingMessages,
      authorName: crmUsers.name,
    })
      .from(crmMessagingMessages)
      .leftJoin(crmUsers, eq(crmMessagingMessages.authorUserId, crmUsers.id))
      .where(eq(crmMessagingMessages.conversationId, conversationId))
      .orderBy(asc(crmMessagingMessages.createdAt));
    
    return results.map(r => ({
      ...r.message,
      authorName: r.authorName,
    }));
  }

  async createMessage(message: InsertCrmMessagingMessage): Promise<CrmMessagingMessage> {
    const [created] = await db.insert(crmMessagingMessages).values(message as any).returning();
    
    if (message.direction === 'outbound') {
      await db.update(crmMessagingConversations)
        .set({ 
          lastMessageAt: new Date(),
          lastOutboundAt: new Date(),
          updatedAt: new Date()
        })
        .where(eq(crmMessagingConversations.id, message.conversationId));
    } else if (message.direction === 'inbound') {
      const conversation = await this.getMessagingConversationById(message.conversationId);
      if (conversation) {
        await db.update(crmMessagingConversations)
          .set({ 
            lastMessageAt: new Date(),
            unreadInboundCount: (conversation.unreadInboundCount || 0) + 1,
            updatedAt: new Date()
          })
          .where(eq(crmMessagingConversations.id, message.conversationId));
      }
    } else {
      await db.update(crmMessagingConversations)
        .set({ 
          lastMessageAt: new Date(),
          updatedAt: new Date()
        })
        .where(eq(crmMessagingConversations.id, message.conversationId));
    }
    
    return created;
  }

  async updateMessage(id: string, updates: Partial<InsertCrmMessagingMessage>): Promise<CrmMessagingMessage | undefined> {
    const [updated] = await db.update(crmMessagingMessages)
      .set(updates as any)
      .where(eq(crmMessagingMessages.id, id))
      .returning();
    return updated || undefined;
  }

  async getConversationTags(conversationId: string): Promise<CrmMessagingConversationTag[]> {
    return await db.select().from(crmMessagingConversationTags)
      .where(eq(crmMessagingConversationTags.conversationId, conversationId));
  }

  async addConversationTag(conversationId: string, tag: string): Promise<CrmMessagingConversationTag> {
    const [created] = await db.insert(crmMessagingConversationTags)
      .values({ conversationId, tag })
      .returning();
    return created;
  }

  async removeConversationTag(conversationId: string, tag: string): Promise<void> {
    await db.delete(crmMessagingConversationTags)
      .where(and(
        eq(crmMessagingConversationTags.conversationId, conversationId),
        eq(crmMessagingConversationTags.tag, tag)
      ));
  }

  async deleteMessagingConversation(id: string): Promise<boolean> {
    // First delete all messages for this conversation
    await db.delete(crmMessagingMessages)
      .where(eq(crmMessagingMessages.conversationId, id));
    
    // Delete all tags for this conversation
    await db.delete(crmMessagingConversationTags)
      .where(eq(crmMessagingConversationTags.conversationId, id));
    
    // Delete the conversation itself
    const result = await db.delete(crmMessagingConversations)
      .where(eq(crmMessagingConversations.id, id))
      .returning();
    
    return result.length > 0;
  }

  async getMobileConversations(userId: string, filters?: { status?: string; search?: string }): Promise<(CrmMessagingConversation & { customer: { id: string; name: string; phone: string | null } | null })[]> {
    const baseQuery = db.select({
      conversation: crmMessagingConversations,
      customer: {
        id: crmCustomers.id,
        name: crmCustomers.name,
        phone: crmCustomers.phone,
      }
    })
    .from(crmMessagingConversations)
    .leftJoin(crmCustomers, eq(crmMessagingConversations.customerId, crmCustomers.id));

    let results;
    
    const statusFilter = filters?.status && filters.status !== "all" 
      ? eq(crmMessagingConversations.status, filters.status as any)
      : (!filters?.status ? eq(crmMessagingConversations.status, "open") : null);
    
    if (filters?.search) {
      const searchTerm = `%${filters.search}%`;
      const searchCondition = or(
        ilike(crmMessagingConversations.customerName, searchTerm),
        ilike(crmMessagingConversations.phoneNumber, searchTerm),
        ilike(crmCustomers.name, searchTerm),
        ilike(crmCustomers.phone, searchTerm)
      );
      
      if (statusFilter) {
        results = await baseQuery
          .where(and(statusFilter, searchCondition))
          .orderBy(sql`${crmMessagingConversations.lastMessageAt} DESC NULLS LAST`)
          .limit(50);
      } else {
        results = await baseQuery
          .where(searchCondition)
          .orderBy(sql`${crmMessagingConversations.lastMessageAt} DESC NULLS LAST`)
          .limit(50);
      }
    } else {
      if (statusFilter) {
        results = await baseQuery
          .where(statusFilter)
          .orderBy(sql`${crmMessagingConversations.lastMessageAt} DESC NULLS LAST`)
          .limit(50);
      } else {
        results = await baseQuery
          .orderBy(sql`${crmMessagingConversations.lastMessageAt} DESC NULLS LAST`)
          .limit(50);
      }
    }

    return results.map(r => ({
      ...r.conversation,
      customer: r.customer || null
    }));
  }

  async searchCrmCustomers(search: string, limit: number = 20): Promise<{ id: string; name: string; phone: string | null; email: string | null }[]> {
    if (!search || search.trim().length < 2) {
      return [];
    }
    const searchTerm = `%${search.trim()}%`;
    
    const results = await db.select({
      id: crmCustomers.id,
      name: crmCustomers.name,
      phone: crmCustomers.phone,
      email: crmCustomers.email,
    })
    .from(crmCustomers)
    .where(or(
      ilike(crmCustomers.name, searchTerm),
      ilike(crmCustomers.phone, searchTerm)
    ))
    .limit(limit);

    return results;
  }

  async getMessagingConversationByExternalId(externalConversationId: string, externalSource: string): Promise<CrmMessagingConversation | undefined> {
    const [conversation] = await db.select().from(crmMessagingConversations)
      .where(and(
        eq(crmMessagingConversations.externalConversationId, externalConversationId),
        eq(crmMessagingConversations.externalSource, externalSource as any)
      ));
    return conversation || undefined;
  }

  async getMessagingConversationByPhone(phoneNumber: string): Promise<CrmMessagingConversation | undefined> {
    const normalizedPhone = phoneNumber.replace(/\D/g, '');
    const phoneVariants = [
      phoneNumber,
      normalizedPhone,
      `+${normalizedPhone}`,
      `+1${normalizedPhone}`,
      normalizedPhone.slice(-10),
    ];
    
    const [conversation] = await db.select().from(crmMessagingConversations)
      .where(or(
        ...phoneVariants.map(p => ilike(crmMessagingConversations.phoneNumber, `%${p}%`))
      ))
      .orderBy(sql`${crmMessagingConversations.lastMessageAt} DESC NULLS LAST`)
      .limit(1);
    
    return conversation || undefined;
  }

  async getCrmCustomerByPhone(phone: string): Promise<{ id: string; name: string; phone: string | null; email: string | null } | undefined> {
    const normalizedPhone = phone.replace(/\D/g, '');
    const phoneVariants = [
      phone,
      normalizedPhone,
      `+${normalizedPhone}`,
      `+1${normalizedPhone}`,
      normalizedPhone.slice(-10),
    ];
    
    const [customer] = await db.select({
      id: crmCustomers.id,
      name: crmCustomers.name,
      phone: crmCustomers.phone,
      email: crmCustomers.email,
    })
    .from(crmCustomers)
    .where(or(
      ...phoneVariants.map(p => ilike(crmCustomers.phone, `%${p}%`))
    ))
    .limit(1);
    
    return customer || undefined;
  }

  // Time Entry operations
  async getActiveTimeEntry(technicianId: string): Promise<CrmTimeEntry | null> {
    const [entry] = await db.select().from(crmTimeEntries)
      .where(and(
        eq(crmTimeEntries.technicianId, technicianId),
        isNull(crmTimeEntries.clockOutAt)
      ))
      .limit(1);
    return entry || null;
  }

  async clockIn(technicianId: string, workOrderId?: string, source?: string): Promise<CrmTimeEntry> {
    const now = new Date();
    const [entry] = await db.insert(crmTimeEntries)
      .values({
        technicianId,
        workOrderId: workOrderId || null,
        clockInAt: now,
        source: (source as any) || "mobile",
        createdById: technicianId,
      })
      .returning();
    return entry;
  }

  async clockOut(entryId: string, notes?: string): Promise<CrmTimeEntry> {
    const [existing] = await db.select().from(crmTimeEntries)
      .where(eq(crmTimeEntries.id, entryId))
      .limit(1);
    
    if (!existing) {
      throw new Error("Time entry not found");
    }

    const now = new Date();
    const clockInTime = new Date(existing.clockInAt);
    const durationMinutes = Math.round((now.getTime() - clockInTime.getTime()) / (1000 * 60));

    const [updated] = await db.update(crmTimeEntries)
      .set({
        clockOutAt: now,
        durationMinutes,
        ...(notes !== undefined ? { notes } : {}),
        updatedAt: now,
      })
      .where(eq(crmTimeEntries.id, entryId))
      .returning();
    return updated;
  }

  async getTimeEntries(filters: { technicianId?: string; startDate?: Date; endDate?: Date }): Promise<CrmTimeEntry[]> {
    const conditions = [];
    
    if (filters.technicianId) {
      conditions.push(eq(crmTimeEntries.technicianId, filters.technicianId));
    }
    if (filters.startDate) {
      conditions.push(gte(crmTimeEntries.clockInAt, filters.startDate));
    }
    if (filters.endDate) {
      conditions.push(lte(crmTimeEntries.clockInAt, filters.endDate));
    }

    if (conditions.length === 0) {
      return await db.select().from(crmTimeEntries).orderBy(desc(crmTimeEntries.clockInAt));
    }
    
    return await db.select().from(crmTimeEntries)
      .where(and(...conditions))
      .orderBy(desc(crmTimeEntries.clockInAt));
  }

  async updateTimeEntry(id: string, data: Partial<InsertCrmTimeEntry>): Promise<CrmTimeEntry> {
    const [updated] = await db.update(crmTimeEntries)
      .set({ ...data, updatedAt: new Date() } as any)
      .where(eq(crmTimeEntries.id, id))
      .returning();
    
    if (!updated) {
      throw new Error("Time entry not found");
    }
    return updated;
  }

  async deleteTimeEntry(id: string): Promise<void> {
    await db.delete(crmTimeEntries).where(eq(crmTimeEntries.id, id));
  }

  async getActiveTimeEntries(): Promise<CrmTimeEntry[]> {
    return await db.select().from(crmTimeEntries)
      .where(isNull(crmTimeEntries.clockOutAt))
      .orderBy(desc(crmTimeEntries.clockInAt));
  }

  // SMS Notification Log operations
  async createSmsNotificationLog(data: InsertSmsNotificationLog): Promise<SmsNotificationLog> {
    const [created] = await db.insert(smsNotificationLog).values(data as any).returning();
    return created;
  }

  async getSmsNotificationByReference(
    notificationType: SmsNotificationType, 
    referenceId: string, 
    referenceType: 'maintenance_visit' | 'work_order' | 'invoice'
  ): Promise<SmsNotificationLog | undefined> {
    let condition;
    if (referenceType === 'maintenance_visit') {
      condition = and(
        eq(smsNotificationLog.notificationType, notificationType),
        eq(smsNotificationLog.maintenanceVisitId, referenceId)
      );
    } else if (referenceType === 'work_order') {
      condition = and(
        eq(smsNotificationLog.notificationType, notificationType),
        eq(smsNotificationLog.workOrderId, referenceId)
      );
    } else {
      condition = and(
        eq(smsNotificationLog.notificationType, notificationType),
        eq(smsNotificationLog.invoiceId, referenceId)
      );
    }
    
    const [notification] = await db.select().from(smsNotificationLog).where(condition);
    return notification || undefined;
  }

  async updateSmsNotificationLog(id: string, data: Partial<InsertSmsNotificationLog>): Promise<SmsNotificationLog | undefined> {
    const [updated] = await db.update(smsNotificationLog)
      .set(data as any)
      .where(eq(smsNotificationLog.id, id))
      .returning();
    return updated || undefined;
  }

  // CRM Project Task operations
  async getProjectTasks(projectId: string): Promise<CrmProjectTask[]> {
    return await db
      .select()
      .from(crmProjectTasks)
      .where(eq(crmProjectTasks.projectId, projectId))
      .orderBy(asc(crmProjectTasks.sortOrder), asc(crmProjectTasks.createdAt));
  }

  async getProjectTask(id: string): Promise<CrmProjectTask | undefined> {
    const [task] = await db.select().from(crmProjectTasks).where(eq(crmProjectTasks.id, id));
    return task || undefined;
  }

  async createProjectTask(data: InsertCrmProjectTask): Promise<CrmProjectTask> {
    const [task] = await db
      .insert(crmProjectTasks)
      .values(data as typeof crmProjectTasks.$inferInsert)
      .returning();
    return task;
  }

  async updateProjectTask(id: string, data: Partial<InsertCrmProjectTask>): Promise<CrmProjectTask | undefined> {
    const [task] = await db
      .update(crmProjectTasks)
      .set({ ...data, updatedAt: new Date() } as Partial<typeof crmProjectTasks.$inferInsert>)
      .where(eq(crmProjectTasks.id, id))
      .returning();
    return task || undefined;
  }

  async deleteProjectTask(id: string): Promise<boolean> {
    const result = await db.delete(crmProjectTasks).where(eq(crmProjectTasks.id, id));
    return (result.rowCount || 0) > 0;
  }

  // Task Management - Task Types
  async getTaskTypes(): Promise<TaskType[]> {
    return await db.select().from(taskTypes).orderBy(asc(taskTypes.name));
  }

  async getTaskTypeById(id: string): Promise<TaskType | null> {
    const [taskType] = await db.select().from(taskTypes).where(eq(taskTypes.id, id));
    return taskType || null;
  }

  async createTaskType(data: InsertTaskType): Promise<TaskType> {
    const [taskType] = await db
      .insert(taskTypes)
      .values(data as typeof taskTypes.$inferInsert)
      .returning();
    return taskType;
  }

  async updateTaskType(id: string, data: Partial<InsertTaskType>): Promise<TaskType | null> {
    const [taskType] = await db
      .update(taskTypes)
      .set({ ...data, updatedAt: new Date() } as Partial<typeof taskTypes.$inferInsert>)
      .where(eq(taskTypes.id, id))
      .returning();
    return taskType || null;
  }

  async deleteTaskType(id: string): Promise<boolean> {
    const result = await db.delete(taskTypes).where(eq(taskTypes.id, id));
    return (result.rowCount || 0) > 0;
  }

  // Task Management - Tasks
  async getTasks(filters?: {
    assignedToUserId?: string;
    createdByUserId?: string;
    status?: string;
    typeId?: string;
    priority?: string;
    taskList?: string;
    dueDateStart?: Date;
    dueDateEnd?: Date;
    overdue?: boolean;
    relatedEntityType?: string;
    relatedEntityId?: string;
    customerId?: string;
    searchText?: string;
    hideCompleted?: boolean;
    dueDateFilter?: string;
    limit?: number;
    offset?: number;
  }): Promise<Task[]> {
    const conditions: SQL[] = [];

    // Handle user ownership filtering: if BOTH assignedToUserId and createdByUserId are provided,
    // use OR logic (show tasks assigned to user OR created by user).
    // If only one is provided, use AND logic (exact filter).
    if (filters?.assignedToUserId && filters?.createdByUserId) {
      const userOwnershipCondition = or(
        eq(tasks.assignedToUserId, filters.assignedToUserId),
        eq(tasks.createdByUserId, filters.createdByUserId)
      );
      if (userOwnershipCondition) {
        conditions.push(userOwnershipCondition);
      }
    } else if (filters?.assignedToUserId) {
      conditions.push(eq(tasks.assignedToUserId, filters.assignedToUserId));
    } else if (filters?.createdByUserId) {
      conditions.push(eq(tasks.createdByUserId, filters.createdByUserId));
    }
    if (filters?.status) {
      conditions.push(eq(tasks.status, filters.status as any));
    }
    if (filters?.typeId) {
      conditions.push(eq(tasks.typeId, filters.typeId));
    }
    if (filters?.priority) {
      conditions.push(eq(tasks.priority, filters.priority as any));
    }
    if (filters?.taskList) {
      conditions.push(eq(tasks.taskList, filters.taskList as any));
    }
    if (filters?.hideCompleted) {
      conditions.push(ne(tasks.status, 'completed' as any));
      conditions.push(ne(tasks.status, 'cancelled' as any));
    }
    if (filters?.dueDateFilter) {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const next7Days = new Date(today);
      next7Days.setDate(next7Days.getDate() + 7);

      if (filters.dueDateFilter === 'overdue') {
        conditions.push(lt(tasks.dueAt, today));
        conditions.push(isNotNull(tasks.dueAt));
      } else if (filters.dueDateFilter === 'today') {
        conditions.push(gte(tasks.dueAt, today));
        conditions.push(lt(tasks.dueAt, tomorrow));
      } else if (filters.dueDateFilter === 'next7days') {
        conditions.push(gte(tasks.dueAt, today));
        conditions.push(lt(tasks.dueAt, next7Days));
      } else if (filters.dueDateFilter === 'nodate') {
        conditions.push(isNull(tasks.dueAt));
      }
    }
    if (filters?.dueDateStart) {
      conditions.push(gte(tasks.dueAt, filters.dueDateStart));
    }
    if (filters?.dueDateEnd) {
      conditions.push(lte(tasks.dueAt, filters.dueDateEnd));
    }
    if (filters?.relatedEntityType) {
      conditions.push(eq(tasks.relatedEntityType, filters.relatedEntityType as any));
    }
    if (filters?.relatedEntityId) {
      conditions.push(eq(tasks.relatedEntityId, filters.relatedEntityId));
    }
    if (filters?.customerId) {
      conditions.push(eq(tasks.customerId, filters.customerId));
    }
    if (filters?.overdue) {
      const overdueCondition = and(
        lt(tasks.dueAt, new Date()),
        ne(tasks.status, 'completed' as any),
        ne(tasks.status, 'cancelled' as any)
      );
      if (overdueCondition) {
        conditions.push(overdueCondition);
      }
    }
    if (filters?.searchText) {
      const searchCondition = or(
        ilike(tasks.title, `%${filters.searchText}%`),
        ilike(tasks.description, `%${filters.searchText}%`)
      );
      if (searchCondition) {
        conditions.push(searchCondition);
      }
    }

    const baseQuery = conditions.length > 0
      ? db.select().from(tasks).where(and(...conditions))
      : db.select().from(tasks);

    const limitValue = filters?.limit || 100;
    const offsetValue = filters?.offset || 0;

    return await baseQuery
      .orderBy(desc(tasks.createdAt))
      .limit(limitValue)
      .offset(offsetValue);
  }

  async getTaskById(id: string): Promise<Task | null> {
    const [task] = await db.select().from(tasks).where(eq(tasks.id, id));
    return task || null;
  }

  async createTask(data: InsertTask): Promise<Task> {
    const [task] = await db
      .insert(tasks)
      .values(data as typeof tasks.$inferInsert)
      .returning();
    return task;
  }

  async updateTask(id: string, data: Partial<InsertTask>): Promise<Task | null> {
    const updateData: Record<string, any> = { ...data, updatedAt: new Date() };
    
    // Convert date strings to Date objects (Drizzle requires Date for timestamp columns)
    const dateFields = ['dueAt', 'startAt', 'endAt', 'remindAt'];
    for (const field of dateFields) {
      if (field in updateData && updateData[field] !== null && updateData[field] !== undefined) {
        if (typeof updateData[field] === 'string') {
          updateData[field] = new Date(updateData[field]);
        }
      }
    }
    
    if (data.status === 'completed') {
      updateData.completedAt = new Date();
    }
    
    const [task] = await db
      .update(tasks)
      .set(updateData as Partial<typeof tasks.$inferInsert>)
      .where(eq(tasks.id, id))
      .returning();
    return task || null;
  }

  async deleteTask(id: string): Promise<boolean> {
    await db.delete(taskActivity).where(eq(taskActivity.taskId, id));
    const result = await db.delete(tasks).where(eq(tasks.id, id));
    return (result.rowCount || 0) > 0;
  }

  async getTasksByCustomer(customerId: string): Promise<Task[]> {
    return await db.select().from(tasks)
      .where(eq(tasks.customerId, customerId))
      .orderBy(desc(tasks.createdAt));
  }

  async getTasksByRelatedEntity(entityType: string, entityId: string): Promise<Task[]> {
    return await db.select().from(tasks)
      .where(and(
        eq(tasks.relatedEntityType, entityType as any),
        eq(tasks.relatedEntityId, entityId)
      ))
      .orderBy(desc(tasks.createdAt));
  }

  // Task Management - Task Activity
  async createTaskActivity(data: InsertTaskActivity): Promise<TaskActivity> {
    const [activity] = await db
      .insert(taskActivity)
      .values(data as typeof taskActivity.$inferInsert)
      .returning();
    return activity;
  }

  async getTaskActivities(taskId: string): Promise<TaskActivity[]> {
    return await db.select().from(taskActivity)
      .where(eq(taskActivity.taskId, taskId))
      .orderBy(desc(taskActivity.createdAt));
  }

  // Task Subtasks
  async getSubtasksByTaskId(taskId: string): Promise<TaskSubtask[]> {
    return await db.select().from(taskSubtasks)
      .where(eq(taskSubtasks.taskId, taskId))
      .orderBy(taskSubtasks.sortOrder, taskSubtasks.createdAt);
  }

  async getSubtaskById(id: string): Promise<TaskSubtask | null> {
    const [subtask] = await db.select().from(taskSubtasks).where(eq(taskSubtasks.id, id));
    return subtask || null;
  }

  async createSubtask(data: InsertTaskSubtask): Promise<TaskSubtask> {
    const [subtask] = await db.insert(taskSubtasks).values(data).returning();
    return subtask;
  }

  async updateSubtask(id: string, data: Partial<InsertTaskSubtask>): Promise<TaskSubtask | null> {
    const [subtask] = await db.update(taskSubtasks)
      .set(data)
      .where(eq(taskSubtasks.id, id))
      .returning();
    return subtask || null;
  }

  async deleteSubtask(id: string): Promise<boolean> {
    const result = await db.delete(taskSubtasks).where(eq(taskSubtasks.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getSubtasksWithDueDate(startDate: Date, endDate: Date): Promise<(TaskSubtask & { taskTitle: string })[]> {
    const results = await db.select({
      id: taskSubtasks.id,
      taskId: taskSubtasks.taskId,
      title: taskSubtasks.title,
      isCompleted: taskSubtasks.isCompleted,
      dueAt: taskSubtasks.dueAt,
      sortOrder: taskSubtasks.sortOrder,
      createdAt: taskSubtasks.createdAt,
      taskTitle: tasks.title,
    })
    .from(taskSubtasks)
    .innerJoin(tasks, eq(taskSubtasks.taskId, tasks.id))
    .where(
      and(
        isNotNull(taskSubtasks.dueAt),
        gte(taskSubtasks.dueAt, startDate),
        lte(taskSubtasks.dueAt, endDate)
      )
    );
    return results;
  }

  // Initialize default data if needed
  async initializeDefaultData() {
    // Check if technicians already exist
    const existingTechs = await this.getAllTechnicians();
    if (existingTechs.length === 0) {
      const defaultTechnicians = [
        { name: "Brian", email: "brian@ghvac.com" },
        { name: "Chandler", email: "chandler@ghvac.com" },
        { name: "Earnest", email: "earnest@ghvac.com" },
        { name: "Tucker", email: "tucker@ghvac.com" },
      ];

      for (const tech of defaultTechnicians) {
        await this.createTechnician(tech);
      }
    }

    // Check if parts already exist
    const existingParts = await this.getAllParts();
    if (existingParts.length === 0) {
      const defaultParts = [
        // Main Components
        { partNumber: "CB-001", description: "Control Board", category: "Parts", price: "0.00", availability: "Available", vendor: "Various", warranty: true, isCustom: false },
        { partNumber: "EC-001", description: "Evaporator Coil", category: "Parts", price: "0.00", availability: "Available", vendor: "Various", warranty: true, isCustom: false },
        { partNumber: "COMP-001", description: "Compressor", category: "Parts", price: "0.00", availability: "Available", vendor: "Various", warranty: true, isCustom: false },
        
        // Materials (no specific part numbers - category suggestions)
        { partNumber: "MAT-RFD", description: "Refrigerant Filter Dryer", category: "Materials", price: "0.00", availability: "Available", vendor: "Various", warranty: false, isCustom: false },
        { partNumber: "MAT-COP", description: "Copper", category: "Materials", price: "0.00", availability: "Available", vendor: "Various", warranty: false, isCustom: false },
        { partNumber: "MAT-INS", description: "Armaflex Insulation", category: "Materials", price: "0.00", availability: "Available", vendor: "Various", warranty: false, isCustom: false },
        { partNumber: "MAT-AA", description: "Acid Away", category: "Materials", price: "0.00", availability: "Available", vendor: "Various", warranty: false, isCustom: false },
        { partNumber: "MAT-REF", description: "Refrigerant", category: "Materials", price: "0.00", availability: "Available", vendor: "Various", warranty: false, isCustom: false },
      ];

      for (const part of defaultParts) {
        await this.createPart(part);
      }
    }

    // Check if categories already exist
    const existingCategories = await this.getAllCategories();
    if (existingCategories.length === 0) {
      const defaultCategories = [
        { name: "Maintenance", order: "1" },
        { name: "Repair", order: "2" },
        { name: "Installation", order: "3" },
        { name: "Troubleshooting", order: "4" },
        { name: "Safety", order: "5" },
        { name: "System Setup", order: "6" },
      ];

      for (const category of defaultCategories) {
        await this.createCategory(category);
      }
    }
  }

  async getAllProposalTemplates(): Promise<ProposalTemplate[]> {
    return await db.select().from(proposalTemplates).orderBy(desc(proposalTemplates.createdAt));
  }

  async getProposalTemplate(id: string): Promise<ProposalTemplate | undefined> {
    const [template] = await db.select().from(proposalTemplates).where(eq(proposalTemplates.id, id));
    return template || undefined;
  }

  async createProposalTemplate(data: InsertProposalTemplate): Promise<ProposalTemplate> {
    if (data.isDefault) {
      await db.update(proposalTemplates).set({ isDefault: false }).where(eq(proposalTemplates.isDefault, true));
    }
    const [template] = await db.insert(proposalTemplates).values(data).returning();
    return template;
  }

  async updateProposalTemplate(id: string, data: Partial<InsertProposalTemplate>): Promise<ProposalTemplate | undefined> {
    if (data.isDefault) {
      await db.update(proposalTemplates).set({ isDefault: false }).where(eq(proposalTemplates.isDefault, true));
    }
    const [template] = await db.update(proposalTemplates).set(data).where(eq(proposalTemplates.id, id)).returning();
    return template || undefined;
  }

  async deleteProposalTemplate(id: string): Promise<boolean> {
    const result = await db.delete(proposalTemplates).where(eq(proposalTemplates.id, id));
    return (result.rowCount || 0) > 0;
  }

  async getAllProposalTemplateImages(): Promise<ProposalTemplateImage[]> {
    return await db.select().from(proposalTemplateImages).orderBy(desc(proposalTemplateImages.createdAt));
  }

  async createProposalTemplateImage(data: InsertProposalTemplateImage): Promise<ProposalTemplateImage> {
    const [image] = await db.insert(proposalTemplateImages).values(data).returning();
    return image;
  }

  async deleteProposalTemplateImage(id: string): Promise<boolean> {
    const result = await db.delete(proposalTemplateImages).where(eq(proposalTemplateImages.id, id));
    return (result.rowCount || 0) > 0;
  }

  async getCustomerFiles(customerId: string): Promise<CustomerFile[]> {
    return db.select().from(customerFiles).where(eq(customerFiles.customerId, customerId)).orderBy(desc(customerFiles.createdAt));
  }

  async createCustomerFile(data: InsertCustomerFile): Promise<CustomerFile> {
    const [file] = await db.insert(customerFiles).values(data).returning();
    return file;
  }

  async deleteCustomerFile(id: string, customerId?: string): Promise<boolean> {
    const conditions = [eq(customerFiles.id, id)];
    if (customerId) conditions.push(eq(customerFiles.customerId, customerId));
    const result = await db.delete(customerFiles).where(and(...conditions));
    return (result.rowCount || 0) > 0;
  }

  // ==================== Rebate Programs ====================
  async getRebateCases(filters: { search?: string; status?: string; programType?: string; assignedToUserId?: string } = {}): Promise<RebateCase[]> {
    const conds: SQL[] = [];
    if (filters.status) conds.push(eq(rebateCases.applicationStatus, filters.status as any));
    if (filters.programType) conds.push(eq(rebateCases.programType, filters.programType as any));
    if (filters.assignedToUserId) conds.push(eq(rebateCases.assignedToUserId, filters.assignedToUserId));
    if (filters.search) {
      const term = `%${filters.search}%`;
      conds.push(or(
        ilike(rebateCases.clientFirstName, term),
        ilike(rebateCases.clientLastName, term),
        ilike(rebateCases.clientEmail, term),
        ilike(rebateCases.clientPhone, term),
        ilike(rebateCases.propertyAddress, term),
        ilike(rebateCases.caseNumber, term),
      )!);
    }
    const q = conds.length > 0
      ? db.select().from(rebateCases).where(and(...conds))
      : db.select().from(rebateCases);
    return q.orderBy(desc(rebateCases.updatedAt));
  }

  async getRebateCase(id: string): Promise<RebateCase | undefined> {
    const [row] = await db.select().from(rebateCases).where(eq(rebateCases.id, id));
    return row;
  }

  async createRebateCase(data: InsertRebateCase): Promise<RebateCase> {
    return db.transaction(async (tx) => {
      const [row] = await tx.insert(rebateCases).values(data).returning();
      // Seed 8 workflow steps
      const steps = rebateWorkflowStepEnum.map((step, idx) => ({
        caseId: row.id,
        step: step as RebateWorkflowStep,
        status: "not_started" as const,
        sortOrder: idx,
      }));
      await tx.insert(rebateCaseWorkflowSteps).values(steps);
      // Seed scope checklist (12 standard Neighborly items)
      const scopeItems = [
        "Heat pump HVAC system",
        "Heat pump water heater",
        "Electric stove/cooktop",
        "Heat pump clothes dryer",
        "Electrical panel upgrade",
        "Electric wiring upgrade",
        "Attic / wall insulation",
        "Air sealing",
        "Mechanical ventilation",
        "Door / window replacement",
        "Smart thermostat",
        "Other electrification work",
      ].map((itemName, idx) => ({
        caseId: row.id,
        itemName,
        isChecked: false,
        sortOrder: idx,
      }));
      await tx.insert(rebateCaseScopeChecklist).values(scopeItems);
      return row;
    });
  }

  // Enriched list with workflow progress for dashboard
  async getRebateCasesWithProgress(filters: { search?: string; status?: string; programType?: string; assignedToUserId?: string } = {}) {
    const cases = await this.getRebateCases(filters);
    if (cases.length === 0) return [];
    const ids = cases.map((c) => c.id);
    // Fetch any checked scope-checklist items to count toward Scope of Work completion
    const checkedScope = await db.select({ caseId: rebateCaseScopeChecklist.caseId })
      .from(rebateCaseScopeChecklist)
      .where(and(inArray(rebateCaseScopeChecklist.caseId, ids), eq(rebateCaseScopeChecklist.isChecked, true)));
    const casesWithScopeItem = new Set(checkedScope.map((r) => r.caseId));

    // Step order must match WORKFLOW_STEPS_ORDER on the client.
    const STEP_ORDER: RebateWorkflowStep[] = [
      "program_overview",
      "rebate_request",
      "head_of_household",
      "scope_of_work",
      "contractor_pre_approval",
      "project_completion",
      "completion_attestations",
      "reservation_summary",
    ];

    return cases.map((c) => {
      const checks: Array<[RebateWorkflowStep, boolean]> = [
        ["program_overview", true],
        ["rebate_request", Boolean(c.clientFirstName && c.clientLastName && c.propertyAddress && c.propertyCity)],
        ["head_of_household", Boolean(c.hohConfirmed)],
        ["scope_of_work", Boolean(
          casesWithScopeItem.has(c.id) ||
          c.scopeIncludesHeatPump || c.scopeIncludesWaterHeater || c.scopeIncludesStove ||
          c.scopeIncludesDryer || c.scopeIncludesPanel || c.scopeIncludesWiring ||
          c.scopeIncludesInsulation
        )],
        ["contractor_pre_approval", c.preApprovalStatus === "approved" || Boolean(c.preApprovalApprovedDate)],
        ["project_completion", Boolean(c.installCompletedDate)],
        ["completion_attestations", Boolean(c.customerAttestationSigned && c.contractorAttestationSigned)],
        ["reservation_summary", Boolean(c.reservationNumber || c.caseCloseoutDate)],
      ];
      const done = new Set<RebateWorkflowStep>();
      for (const [key, ok] of checks) {
        if (!ok) break; // chronological — stop at first incomplete step
        done.add(key);
      }
      // Current step = first step in order that is not yet complete (or last if all done)
      const current = STEP_ORDER.find((s) => !done.has(s)) || STEP_ORDER[STEP_ORDER.length - 1];
      return {
        ...c,
        workflowCompleted: done.size,
        workflowTotal: STEP_ORDER.length,
        currentStep: current,
      };
    });
  }

  async updateRebateCase(id: string, data: Partial<RebateCase>): Promise<RebateCase | undefined> {
    const [row] = await db.update(rebateCases)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(rebateCases.id, id))
      .returning();
    return row;
  }

  async deleteRebateCase(id: string): Promise<boolean> {
    const result = await db.delete(rebateCases).where(eq(rebateCases.id, id));
    return (result.rowCount || 0) > 0;
  }

  async getRebateCaseWorkflowSteps(caseId: string): Promise<RebateCaseWorkflowStep[]> {
    return db.select().from(rebateCaseWorkflowSteps)
      .where(eq(rebateCaseWorkflowSteps.caseId, caseId))
      .orderBy(asc(rebateCaseWorkflowSteps.sortOrder));
  }

  async updateRebateCaseWorkflowStep(id: string, caseId: string, data: Partial<RebateCaseWorkflowStep>): Promise<RebateCaseWorkflowStep | undefined> {
    const [row] = await db.update(rebateCaseWorkflowSteps)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(rebateCaseWorkflowSteps.id, id), eq(rebateCaseWorkflowSteps.caseId, caseId)))
      .returning();
    return row;
  }

  async getRebateCaseScopeChecklist(caseId: string): Promise<RebateCaseScopeChecklist[]> {
    return db.select().from(rebateCaseScopeChecklist)
      .where(eq(rebateCaseScopeChecklist.caseId, caseId))
      .orderBy(asc(rebateCaseScopeChecklist.sortOrder));
  }

  async createRebateScopeItem(data: InsertRebateCaseScopeChecklist): Promise<RebateCaseScopeChecklist> {
    const [row] = await db.insert(rebateCaseScopeChecklist).values(data).returning();
    return row;
  }

  async updateRebateScopeItem(id: string, caseId: string, data: Partial<RebateCaseScopeChecklist>): Promise<RebateCaseScopeChecklist | undefined> {
    const [row] = await db.update(rebateCaseScopeChecklist)
      .set(data)
      .where(and(eq(rebateCaseScopeChecklist.id, id), eq(rebateCaseScopeChecklist.caseId, caseId)))
      .returning();
    return row;
  }

  async deleteRebateScopeItem(id: string, caseId: string): Promise<boolean> {
    const result = await db.delete(rebateCaseScopeChecklist)
      .where(and(eq(rebateCaseScopeChecklist.id, id), eq(rebateCaseScopeChecklist.caseId, caseId)));
    return (result.rowCount || 0) > 0;
  }

  async getRebateCaseDocuments(caseId: string): Promise<RebateCaseDocument[]> {
    return db.select().from(rebateCaseDocuments)
      .where(eq(rebateCaseDocuments.caseId, caseId))
      .orderBy(desc(rebateCaseDocuments.createdAt));
  }

  async createRebateCaseDocument(data: InsertRebateCaseDocument): Promise<RebateCaseDocument> {
    const [row] = await db.insert(rebateCaseDocuments).values(data as any).returning();
    return row;
  }

  async deleteRebateCaseDocument(id: string, caseId: string): Promise<boolean> {
    const result = await db.delete(rebateCaseDocuments)
      .where(and(eq(rebateCaseDocuments.id, id), eq(rebateCaseDocuments.caseId, caseId)));
    return (result.rowCount || 0) > 0;
  }

  async getRebateCaseActivity(caseId: string): Promise<RebateCaseActivityLog[]> {
    return db.select().from(rebateCaseActivityLog)
      .where(eq(rebateCaseActivityLog.caseId, caseId))
      .orderBy(desc(rebateCaseActivityLog.createdAt));
  }

  async logRebateCaseActivity(data: InsertRebateCaseActivityLog): Promise<RebateCaseActivityLog> {
    const [row] = await db.insert(rebateCaseActivityLog).values(data).returning();
    return row;
  }

  // ===== E-Signature documents =====
  async createSignatureDocument(data: InsertSignatureDocument): Promise<SignatureDocument> {
    const [row] = await db.insert(signatureDocuments).values(data).returning();
    return row;
  }
  async getSignatureDocument(id: string): Promise<SignatureDocument | undefined> {
    const [row] = await db.select().from(signatureDocuments).where(eq(signatureDocuments.id, id));
    return row || undefined;
  }
  async getAllSignatureDocuments(): Promise<SignatureDocument[]> {
    return db.select().from(signatureDocuments).orderBy(desc(signatureDocuments.createdAt));
  }
  async updateSignatureDocument(id: string, patch: Partial<SignatureDocument>): Promise<SignatureDocument | undefined> {
    const [row] = await db.update(signatureDocuments).set(patch).where(eq(signatureDocuments.id, id)).returning();
    return row || undefined;
  }
  async deleteSignatureDocument(id: string): Promise<boolean> {
    const res = await db.delete(signatureDocuments).where(eq(signatureDocuments.id, id)).returning();
    return res.length > 0;
  }

  // ===== E-Signature recipients =====
  async createSignatureRecipient(data: InsertSignatureRecipient): Promise<SignatureRecipient> {
    const [row] = await db.insert(signatureRecipients).values(data).returning();
    return row;
  }
  async getSignatureRecipients(documentId: string): Promise<SignatureRecipient[]> {
    return db.select().from(signatureRecipients)
      .where(eq(signatureRecipients.documentId, documentId))
      .orderBy(asc(signatureRecipients.signingOrder), asc(signatureRecipients.createdAt));
  }
  async getSignatureRecipient(id: string): Promise<SignatureRecipient | undefined> {
    const [row] = await db.select().from(signatureRecipients).where(eq(signatureRecipients.id, id));
    return row || undefined;
  }
  async getSignatureRecipientByToken(token: string): Promise<SignatureRecipient | undefined> {
    const [row] = await db.select().from(signatureRecipients).where(eq(signatureRecipients.token, token));
    return row || undefined;
  }
  async updateSignatureRecipient(id: string, patch: Partial<SignatureRecipient>): Promise<SignatureRecipient | undefined> {
    const [row] = await db.update(signatureRecipients).set(patch).where(eq(signatureRecipients.id, id)).returning();
    return row || undefined;
  }
  async deleteSignatureRecipient(id: string): Promise<boolean> {
    const res = await db.delete(signatureRecipients).where(eq(signatureRecipients.id, id)).returning();
    return res.length > 0;
  }

  // ===== E-Signature fields =====
  async getSignatureFields(documentId: string): Promise<SignatureField[]> {
    return db.select().from(signatureFields).where(eq(signatureFields.documentId, documentId));
  }
  async getSignatureFieldsByRecipient(recipientId: string): Promise<SignatureField[]> {
    return db.select().from(signatureFields).where(eq(signatureFields.recipientId, recipientId));
  }
  async updateSignatureField(id: string, patch: Partial<SignatureField>): Promise<SignatureField | undefined> {
    const [row] = await db.update(signatureFields).set(patch).where(eq(signatureFields.id, id)).returning();
    return row || undefined;
  }
  async replaceSignatureFields(documentId: string, fields: InsertSignatureField[]): Promise<SignatureField[]> {
    await db.delete(signatureFields).where(eq(signatureFields.documentId, documentId));
    if (fields.length === 0) return [];
    return db.insert(signatureFields).values(fields).returning();
  }
}

// Initialize database storage and default data
const databaseStorage = new DatabaseStorage();

// Initialize default data on startup
databaseStorage.initializeDefaultData().catch(console.error);

export const storage = databaseStorage;
