# Backend Logic Flowchart

This document contains Mermaid flowcharts documenting the backend architecture and logic flows.

## Main Request Flow

```mermaid
flowchart TD
    Start([HTTP Request]) --> Server[Express Server<br/>Port 5000]
    Server --> Middleware{Middleware Chain}

    Middleware --> Compression[Compression]
    Compression --> Session[Session Management<br/>PostgreSQL Store]
    Session --> Passport[Passport.js<br/>Employee Auth]
    Passport --> Router{Route Matching}

    Router -->|/api/employee-portal/*| EmployeeAuth[Employee Portal Routes]
    Router -->|/api/crm/*| CRMAuth[CRM Routes]
    Router -->|/api/quotes/*| QuoteRoutes[Quote Routes]
    Router -->|/api/voice/*| VoiceRoutes[Voice Routes]
    Router -->|/api/weather| WeatherRoutes[Weather Routes]
    Router -->|/health| Health[Health Check]
    Router -->|Static Files| Static[Serve Client App]

    EmployeeAuth --> Response([Response])
    CRMAuth --> Response
    QuoteRoutes --> Response
    VoiceRoutes --> Response
    WeatherRoutes --> Response
    Health --> Response
    Static --> Response
```

## Authentication Flows

### Employee Portal Authentication (Passport.js)

```mermaid
flowchart TD
    LoginReq([POST /api/employee-portal/login]) --> ValidateInput{Validate<br/>Username & Password}
    ValidateInput -->|Invalid| Error401[401 Unauthorized]
    ValidateInput -->|Valid| LookupUser[Query portalUsers Table]

    LookupUser --> UserExists{User Exists<br/>& Active?}
    UserExists -->|No| Error401
    UserExists -->|Yes| VerifyPassword[Verify Password<br/>scrypt hash]

    VerifyPassword --> PasswordMatch{Password<br/>Match?}
    PasswordMatch -->|No| Error401
    PasswordMatch -->|Yes| CreateSession[Create Session<br/>PostgreSQL Store]

    CreateSession --> SetCookie[Set session.sid Cookie<br/>8 Hour Expiry]
    SetCookie --> UpdateLastLogin[Update lastLogin<br/>Timestamp]
    UpdateLastLogin --> ReturnUser[Return User Profile<br/>username, email, role]

    ReturnUser --> Success([200 OK])
    Error401 --> End([Response])
    Success --> End

    ChangePasswordReq([POST /api/employee-portal/change-password]) --> AuthCheck{Session<br/>Valid?}
    AuthCheck -->|No| Error401b[401 Unauthorized]
    AuthCheck -->|Yes| VerifyCurrentPwd[Verify Current Password]

    VerifyCurrentPwd --> CurrentMatch{Match?}
    CurrentMatch -->|No| Error401b
    CurrentMatch -->|Yes| HashNewPwd[Hash New Password<br/>scrypt]

    HashNewPwd --> UpdateDB[Update Password<br/>in Database]
    UpdateDB --> Success2([200 OK])
    Error401b --> End2([Response])
    Success2 --> End2
```

### CRM Authentication (Token-based)

```mermaid
flowchart TD
    LoginReq([POST /api/crm/auth/login]) --> ValidateInput{Validate<br/>Username & Password}
    ValidateInput -->|Invalid| Error401[401 Unauthorized]
    ValidateInput -->|Valid| LookupUser[Query crmUsers Table]

    LookupUser --> UserExists{User Exists<br/>& Active?}
    UserExists -->|No| Error401
    UserExists -->|Yes| VerifyPassword[Verify Password<br/>Timing-safe Compare]

    VerifyPassword --> PasswordMatch{Password<br/>Match?}
    PasswordMatch -->|No| Error401
    PasswordMatch -->|Yes| GenerateToken[Generate Session Token<br/>32-byte hex]

    GenerateToken --> SaveSession[Insert to crmSessions<br/>8 Hour Expiry]
    SaveSession --> SetCookie[Set crm_session Cookie]
    SetCookie --> AuditLog[Log to crm_audit_log<br/>Action: login]
    AuditLog --> ReturnData[Return User + Token]

    ReturnData --> Success([200 OK])
    Error401 --> End([Response])
    Success --> End

    AuthMiddleware([CRM Request with Auth]) --> ExtractToken{Extract Token<br/>Cookie or Bearer?}
    ExtractToken -->|Missing| Error401b[401 Unauthorized]
    ExtractToken -->|Present| ValidateSession[Query crmSessions<br/>JOIN crmUsers]

    ValidateSession --> SessionValid{Session Valid<br/>& Not Expired?}
    SessionValid -->|No| Error401b
    SessionValid -->|Yes| UserActive{User<br/>Active?}

    UserActive -->|No| Error401b
    UserActive -->|Yes| UpdateLastSeen[Update lastSeenAt<br/>Throttled to 1/min]
    UpdateLastSeen --> AttachUser[Attach User to req.user]
    AttachUser --> RoleCheck{Role Check<br/>Required?}

    RoleCheck -->|Admin Required| CheckAdmin{Role >= Manager?}
    CheckAdmin -->|No| Error403[403 Forbidden]
    CheckAdmin -->|Yes| Continue([Continue to Handler])

    RoleCheck -->|Sales Required| CheckSales{Role >= Sales?}
    CheckSales -->|No| Error403
    CheckSales -->|Yes| Continue

    RoleCheck -->|No Role Check| Continue

    Error401b --> End2([Response])
    Error403 --> End2
    Continue --> End2
```

## Customer Management Flow

```mermaid
flowchart TD
    CreateCustomer([POST /api/crm/customers]) --> ValidateAuth{CRM Auth<br/>Sales or Above?}
    ValidateAuth -->|No| Error403[403 Forbidden]
    ValidateAuth -->|Yes| ValidateInput{Validate<br/>Customer Data}

    ValidateInput -->|Invalid| Error400[400 Bad Request]
    ValidateInput -->|Valid| CheckDuplicate[Check for Duplicate<br/>Name/Email/Phone]

    CheckDuplicate --> DuplicateExists{Duplicate<br/>Found?}
    DuplicateExists -->|Yes| Error409[409 Conflict]
    DuplicateExists -->|No| InsertCustomer[Insert to crm_customers<br/>Generate UUID]

    InsertCustomer --> CustomerType{Customer<br/>Type?}
    CustomerType -->|Commercial| CreateAccount[Create crmAccount Entry]
    CustomerType -->|Property Manager| CreateAccount
    CustomerType -->|Residential| SkipAccount[Skip Account Creation]

    CreateAccount --> AuditLog[Log to crm_audit_log<br/>Action: customer_created]
    SkipAccount --> AuditLog

    AuditLog --> ReturnCustomer[Return Customer Object<br/>with Properties & Jobs]
    ReturnCustomer --> Success([201 Created])

    Error403 --> End([Response])
    Error400 --> End
    Error409 --> End
    Success --> End

    GetCustomer([GET /api/crm/customers/:id]) --> ValidateAuthGet{CRM Auth<br/>Valid?}
    ValidateAuthGet -->|No| Error401[401 Unauthorized]
    ValidateAuthGet -->|Yes| QueryDB[Query crm_customers<br/>WHERE id AND NOT deleted]

    QueryDB --> CustomerFound{Customer<br/>Found?}
    CustomerFound -->|No| Error404[404 Not Found]
    CustomerFound -->|Yes| FetchRelated[Fetch Related Data<br/>Properties, Jobs, Equipment]

    FetchRelated --> ReturnData[Return Complete<br/>Customer Object]
    ReturnData --> Success2([200 OK])

    Error401 --> End2([Response])
    Error404 --> End2
    Success2 --> End2
```

## Work Order & Dispatch Flow

```mermaid
flowchart TD
    CreateWO([POST /api/crm/work-orders]) --> ValidateAuth{CRM Auth<br/>Dispatcher or Above?}
    ValidateAuth -->|No| Error403[403 Forbidden]
    ValidateAuth -->|Yes| ValidateInput{Validate<br/>Work Order Data}

    ValidateInput -->|Invalid| Error400[400 Bad Request]
    ValidateInput -->|Valid| CheckCustomer[Verify Customer Exists<br/>& Property if Provided]

    CheckCustomer --> CustomerValid{Customer<br/>Valid?}
    CustomerValid -->|No| Error404[404 Not Found]
    CustomerValid -->|Yes| InsertWO[Insert to crm_work_orders<br/>Status: scheduled]

    InsertWO --> SetDefaults[Set Default Values<br/>dispatchQueueStage, visitType]
    SetDefaults --> CreateChecklist[Initialize Checklist<br/>Based on workSubtype]
    CreateChecklist --> AuditLog[Log to crm_audit_log<br/>Action: work_order_created]

    AuditLog --> ReturnWO[Return Work Order Object]
    ReturnWO --> Success([201 Created])

    UpdateWO([PATCH /api/crm/work-orders/:id]) --> ValidateAuthUpdate{CRM Auth<br/>Valid?}
    ValidateAuthUpdate -->|No| Error401[401 Unauthorized]
    ValidateAuthUpdate -->|Yes| FetchWO[Fetch Existing<br/>Work Order]

    FetchWO --> WOExists{WO<br/>Exists?}
    WOExists -->|No| Error404b[404 Not Found]
    WOExists -->|Yes| ValidateUpdate{Validate<br/>Update Fields}

    ValidateUpdate -->|Invalid| Error400b[400 Bad Request]
    ValidateUpdate -->|Valid| StatusChange{Status<br/>Changing?}

    StatusChange -->|scheduled→dispatched| CheckAssignment{Tech<br/>Assigned?}
    CheckAssignment -->|No| Error400c[400 Bad Request<br/>Must assign tech]
    CheckAssignment -->|Yes| UpdateStatus[Update Status & Timestamps]

    StatusChange -->|dispatched→en_route| UpdateStatus
    StatusChange -->|en_route→on_site| UpdateStatus
    StatusChange -->|on_site→completed| ValidateCompletion{Checklist<br/>Complete?}

    ValidateCompletion -->|No| Warn[Warning: Incomplete Checklist]
    ValidateCompletion -->|Yes| UpdateStatus
    Warn --> UpdateStatus

    StatusChange -->|No Status Change| UpdateFields[Update Other Fields]
    UpdateStatus --> AuditLogUpdate[Log to crm_audit_log<br/>Action: work_order_updated]
    UpdateFields --> AuditLogUpdate

    AuditLogUpdate --> ReturnUpdated[Return Updated WO]
    ReturnUpdated --> Success2([200 OK])

    Error403 --> End([Response])
    Error400 --> End
    Error404 --> End
    Error401 --> End
    Error404b --> End
    Error400b --> End
    Error400c --> End
    Success --> End
    Success2 --> End
```

## Quote Generation Flow

```mermaid
flowchart TD
    GenerateQuote([POST /api/quotes/generate]) --> ValidateInput{Validate<br/>Input Data}
    ValidateInput -->|Invalid| Error400[400 Bad Request]
    ValidateInput -->|Valid| PrepareCart[Prepare Cart Items<br/>Equipment, Labor, Accessories]

    PrepareCart --> CalculateTotals[Calculate Subtotals<br/>& Grand Total]
    CalculateTotals --> CheckElitePackage{Elite Package<br/>Eligible?}

    CheckElitePackage -->|Yes| ApplyDiscount[Apply 20% Discount]
    CheckElitePackage -->|No| NoDiscount[No Discount]

    ApplyDiscount --> BuildContext[Build AI Context<br/>Customer, Address, Cart]
    NoDiscount --> BuildContext

    BuildContext --> FetchHistory[Fetch Conversation History<br/>quote_conversations]
    FetchHistory --> CallOpenAI[Call OpenAI API<br/>gpt-3.5-turbo]

    CallOpenAI --> AIResponse{AI Response<br/>Valid?}
    AIResponse -->|Error| Error500[500 Internal Error]
    AIResponse -->|Success| ParseResponse[Parse Structured Response<br/>Title, Description, Line Items]

    ParseResponse --> SaveConversation[Save to quote_conversations]
    SaveConversation --> SaveMessage[Save to quote_messages<br/>User + Assistant]
    SaveMessage --> FormatQuote[Format as Professional<br/>PDF Proposal]

    FormatQuote --> ReturnQuote[Return Quote Data<br/>with Formatting]
    ReturnQuote --> Success([200 OK])

    Error400 --> End([Response])
    Error500 --> End
    Success --> End

    SendQuote([POST /api/crm/quotes/:id/send]) --> ValidateAuthSend{CRM Auth<br/>Sales or Above?}
    ValidateAuthSend -->|No| Error403[403 Forbidden]
    ValidateAuthSend -->|Yes| FetchQuote[Fetch Quote<br/>from crm_quotes]

    FetchQuote --> QuoteExists{Quote<br/>Exists?}
    QuoteExists -->|No| Error404[404 Not Found]
    QuoteExists -->|Yes| ValidateEmail{Customer Email<br/>Valid?}

    ValidateEmail -->|No| Error400b[400 Bad Request]
    ValidateEmail -->|Yes| RenderTemplate[Render Email Template<br/>HTML with Line Items]

    RenderTemplate --> CallResend[Call Resend API<br/>Send Email]
    CallResend --> EmailSent{Email<br/>Sent?}

    EmailSent -->|Error| Error500b[500 Internal Error]
    EmailSent -->|Success| UpdateQuote[Update Quote Status<br/>sentAt timestamp]

    UpdateQuote --> AuditLog[Log to crm_audit_log<br/>Action: quote_sent]
    AuditLog --> Success2([200 OK])

    Error403 --> End2([Response])
    Error404 --> End2
    Error400b --> End2
    Error500b --> End2
    Success2 --> End2
```

## Voice Transcription Flow

```mermaid
flowchart TD
    TranscribeReq([POST /api/voice/transcribe-with-context]) --> ValidateAuth{CRM Auth<br/>Valid?}
    ValidateAuth -->|No| Error401[401 Unauthorized]
    ValidateAuth -->|Yes| CheckFile{Audio File<br/>Uploaded?}

    CheckFile -->|No| Error400[400 Bad Request]
    CheckFile -->|Yes| ValidateFormat{Valid Audio<br/>Format?}

    ValidateFormat -->|No| Error400b[400 Unsupported Format]
    ValidateFormat -->|Yes| CallWhisper[Call OpenAI Whisper API<br/>whisper-1 model]

    CallWhisper --> WhisperSuccess{Transcription<br/>Success?}
    WhisperSuccess -->|Error| Error500[500 Internal Error]
    WhisperSuccess -->|Success| GetTranscript[Extract Text Transcript]

    GetTranscript --> HasContext{Field Context<br/>Provided?}
    HasContext -->|No| ReturnRaw[Return Raw Transcript]
    HasContext -->|Yes| BuildPrompt[Build Context Prompt<br/>Field Type & Usage]

    BuildPrompt --> CallGPT[Call GPT-3.5-turbo<br/>Format & Clean Text]
    CallGPT --> GPTSuccess{GPT Response<br/>Valid?}

    GPTSuccess -->|Error| ReturnRaw
    GPTSuccess -->|Success| FormatText[Extract Formatted Text<br/>Grammar Corrected]

    FormatText --> ReturnFormatted[Return Formatted Transcript]
    ReturnRaw --> Success([200 OK])
    ReturnFormatted --> Success

    Error401 --> End([Response])
    Error400 --> End
    Error400b --> End
    Error500 --> End
    Success --> End
```

## Customer Sync from Google Sheets

```mermaid
flowchart TD
    SyncTrigger([Scheduled Sync / Manual Trigger]) --> CheckRateLimit{Daily Sync<br/>Limit Reached?}
    CheckRateLimit -->|Yes| Skip([Skip Sync])
    CheckRateLimit -->|No| FetchSheets[Call Google Sheets API<br/>Read Customer Data]

    FetchSheets --> SheetsSuccess{API Call<br/>Success?}
    SheetsSuccess -->|Error| LogError[Log Error<br/>Update Sync Status]
    SheetsSuccess -->|Success| CalculateHash[Calculate Data Hash<br/>Detect Changes]

    CalculateHash --> DataChanged{Data Hash<br/>Changed?}
    DataChanged -->|No| UpdateTimestamp[Update lastCheck<br/>Skip Processing]
    DataChanged -->|Yes| ProcessRows[Iterate Through Rows]

    ProcessRows --> ForEachRow{For Each<br/>Row}
    ForEachRow -->|Row| CalculateChecksum[Calculate Row Checksum]

    CalculateChecksum --> LookupCustomer[Lookup Existing Customer<br/>By Email/Phone/Name]
    LookupCustomer --> CustomerExists{Customer<br/>Exists?}

    CustomerExists -->|No| CreateCustomer[Insert New Customer<br/>to crm_customers]
    CreateCustomer --> IncrementCreated[Increment Created Count]

    CustomerExists -->|Yes| ChecksumMatch{Checksum<br/>Match?}
    ChecksumMatch -->|Yes| IncrementSkipped[Increment Skipped Count]
    ChecksumMatch -->|No| UpdateCustomer[Update Existing Customer<br/>Data]

    UpdateCustomer --> IncrementUpdated[Increment Updated Count]

    IncrementCreated --> NextRow{More<br/>Rows?}
    IncrementSkipped --> NextRow
    IncrementUpdated --> NextRow

    NextRow -->|Yes| ForEachRow
    NextRow -->|No| UpdateSyncStatus[Update Sync Status<br/>Results & Timestamp]

    UpdateSyncStatus --> LogSuccess[Log Sync Success<br/>Counts & Duration]
    LogSuccess --> Complete([Sync Complete])

    UpdateTimestamp --> Complete
    LogError --> Complete
    Skip --> Complete
```

## Invoice & Payment Flow

```mermaid
flowchart TD
    CreateInvoice([POST /api/crm/invoices]) --> ValidateAuth{CRM Auth<br/>Sales or Above?}
    ValidateAuth -->|No| Error403[403 Forbidden]
    ValidateAuth -->|Yes| ValidateInput{Validate<br/>Invoice Data}

    ValidateInput -->|Invalid| Error400[400 Bad Request]
    ValidateInput -->|Valid| CheckCustomer[Verify Customer<br/>& Work Order Exist]

    CheckCustomer --> RefsValid{References<br/>Valid?}
    RefsValid -->|No| Error404[404 Not Found]
    RefsValid -->|Yes| CalculateTotal[Calculate Total<br/>Sum Line Items]

    CalculateTotal --> InsertInvoice[Insert to crm_invoices<br/>Status: draft]
    InsertInvoice --> InsertLineItems[Insert to crm_invoice_line_items]
    InsertLineItems --> UpdateWO[Update Work Order<br/>billingDisposition]

    UpdateWO --> AuditLog[Log to crm_audit_log<br/>Action: invoice_created]
    AuditLog --> ReturnInvoice[Return Invoice Object<br/>with Line Items]
    ReturnInvoice --> Success([201 Created])

    SendInvoice([POST /api/crm/invoices/:id/send]) --> ValidateAuthSend{CRM Auth<br/>Sales or Above?}
    ValidateAuthSend -->|No| Error403b[403 Forbidden]
    ValidateAuthSend -->|Yes| FetchInvoice[Fetch Invoice<br/>with Line Items]

    FetchInvoice --> InvoiceExists{Invoice<br/>Exists?}
    InvoiceExists -->|No| Error404b[404 Not Found]
    InvoiceExists -->|Yes| CheckDraft{Status =<br/>draft?}

    CheckDraft -->|No| Error400b[400 Bad Request<br/>Already Sent]
    CheckDraft -->|Yes| RenderEmail[Render Invoice Email<br/>HTML Template]

    RenderEmail --> CallResend[Call Resend API<br/>Send Email]
    CallResend --> EmailSent{Email<br/>Sent?}

    EmailSent -->|Error| Error500[500 Internal Error]
    EmailSent -->|Success| UpdateStatus[Update Status: sent<br/>sentAt timestamp]

    UpdateStatus --> AuditLogSend[Log to crm_audit_log<br/>Action: invoice_sent]
    AuditLogSend --> Success2([200 OK])

    PayInvoice([POST /api/crm/invoices/:id/pay]) --> ValidateAuthPay{CRM Auth<br/>Valid?}
    ValidateAuthPay -->|No| Error401[401 Unauthorized]
    ValidateAuthPay -->|Yes| FetchInvoicePay[Fetch Invoice]

    FetchInvoicePay --> InvoiceExistsPay{Invoice<br/>Exists?}
    InvoiceExistsPay -->|No| Error404c[404 Not Found]
    InvoiceExistsPay -->|Yes| CheckPaid{Already<br/>Paid?}

    CheckPaid -->|Yes| Error400c[400 Already Paid]
    CheckPaid -->|No| ValidatePayment{Validate Payment<br/>Amount & Method}

    ValidatePayment -->|Invalid| Error400d[400 Bad Request]
    ValidatePayment -->|Valid| RecordPayment[Insert to crm_payments<br/>Amount, Method, Date]

    RecordPayment --> UpdateInvoiceStatus[Update Invoice<br/>Status: paid]
    UpdateInvoiceStatus --> AuditLogPay[Log to crm_audit_log<br/>Action: payment_received]
    AuditLogPay --> Success3([200 OK])

    Error403 --> End([Response])
    Error400 --> End
    Error404 --> End
    Error403b --> End
    Error404b --> End
    Error400b --> End
    Error500 --> End
    Error401 --> End
    Error404c --> End
    Error400c --> End
    Error400d --> End
    Success --> End
    Success2 --> End
    Success3 --> End
```

## Project Pipeline Flow

```mermaid
flowchart TD
    CreateProject([POST /api/crm/projects]) --> ValidateAuth{CRM Auth<br/>Sales or Above?}
    ValidateAuth -->|No| Error403[403 Forbidden]
    ValidateAuth -->|Yes| ValidateInput{Validate<br/>Project Data}

    ValidateInput -->|Invalid| Error400[400 Bad Request]
    ValidateInput -->|Valid| CheckCustomer[Verify Customer<br/>& Property Exist]

    CheckCustomer --> RefsValid{References<br/>Valid?}
    RefsValid -->|No| Error404[404 Not Found]
    RefsValid -->|Yes| InsertProject[Insert to crm_projects<br/>Status: lead]

    InsertProject --> SetDefaults[Set Default Values<br/>Priority, Type, Value]
    SetDefaults --> AuditLog[Log to crm_audit_log<br/>Action: project_created]

    AuditLog --> ReturnProject[Return Project Object]
    ReturnProject --> Success([201 Created])

    UpdateStatus([PATCH /api/crm/projects/:id/status]) --> ValidateAuthUpdate{CRM Auth<br/>Sales or Above?}
    ValidateAuthUpdate -->|No| Error403b[403 Forbidden]
    ValidateAuthUpdate -->|Yes| FetchProject[Fetch Project]

    FetchProject --> ProjectExists{Project<br/>Exists?}
    ProjectExists -->|No| Error404b[404 Not Found]
    ProjectExists -->|Yes| ValidateStatus{Valid Status<br/>Transition?}

    ValidateStatus -->|Invalid| Error400b[400 Bad Request]
    ValidateStatus -->|Valid| UpdateStatusField[Update status Field]

    UpdateStatusField --> SetTimestamp{Set Status<br/>Timestamp?}
    SetTimestamp -->|proposal_sent| UpdateProposalDate[Set proposalSentAt]
    SetTimestamp -->|approved| UpdateApprovalDate[Set approvedAt]
    SetTimestamp -->|completed| UpdateCompletionDate[Set completedAt]
    SetTimestamp -->|Other| SkipTimestamp[Skip Timestamp]

    UpdateProposalDate --> AuditLogStatus[Log to crm_audit_log<br/>Action: project_status_changed]
    UpdateApprovalDate --> AuditLogStatus
    UpdateCompletionDate --> AuditLogStatus
    SkipTimestamp --> AuditLogStatus

    AuditLogStatus --> Success2([200 OK])

    AddActivity([POST /api/crm/projects/:id/activities]) --> ValidateAuthActivity{CRM Auth<br/>Valid?}
    ValidateAuthActivity -->|No| Error401[401 Unauthorized]
    ValidateAuthActivity -->|Yes| FetchProjectActivity[Fetch Project]

    FetchProjectActivity --> ProjectExistsActivity{Project<br/>Exists?}
    ProjectExistsActivity -->|No| Error404c[404 Not Found]
    ProjectExistsActivity -->|Yes| ValidateActivity{Validate<br/>Activity Data}

    ValidateActivity -->|Invalid| Error400c[400 Bad Request]
    ValidateActivity -->|Valid| InsertActivity[Insert to project_activities<br/>Type, Description, Files]

    InsertActivity --> FileUploads{Files<br/>Attached?}
    FileUploads -->|Yes| UploadToGCS[Upload to Google Cloud Storage]
    FileUploads -->|No| SkipUpload[Skip Upload]

    UploadToGCS --> AuditLogActivity[Log to crm_audit_log<br/>Action: activity_added]
    SkipUpload --> AuditLogActivity

    AuditLogActivity --> Success3([201 Created])

    Error403 --> End([Response])
    Error400 --> End
    Error404 --> End
    Error403b --> End
    Error404b --> End
    Error400b --> End
    Error401 --> End
    Error404c --> End
    Error400c --> End
    Success --> End
    Success2 --> End
    Success3 --> End
```

## Database Architecture

```mermaid
graph LR
    subgraph Core Tables
        CU[crm_customers]
        PR[crm_properties]
        EQ[crm_equipment]
        US[crm_users]
        SE[crm_sessions]
    end

    subgraph Work Management
        JB[crm_jobs]
        WO[crm_work_orders]
        PJ[crm_projects]
    end

    subgraph Financial
        QT[crm_quotes]
        QL[crm_quote_line_items]
        IN[crm_invoices]
        IL[crm_invoice_line_items]
        PM[crm_payments]
        AG[crm_agreements]
    end

    subgraph Commercial
        AC[crm_accounts]
        SI[crm_sites]
        CN[crm_contacts]
    end

    subgraph Audit
        AL[crm_audit_log]
    end

    CU -->|has many| PR
    CU -->|has many| JB
    CU -->|has one| AC
    PR -->|has many| EQ
    PR -->|has many| WO
    JB -->|has many| WO
    WO -->|has many| QT
    WO -->|has one| IN
    QT -->|has many| QL
    IN -->|has many| IL
    IN -->|has many| PM
    AC -->|has many| SI
    AC -->|has many| CN
    US -->|has many| SE
    AL -.->|logs all| CU
    AL -.->|logs all| WO
    AL -.->|logs all| QT
    AL -.->|logs all| IN
```

## External Service Integrations

```mermaid
flowchart LR
    Backend[Express Backend] --> OpenAI[OpenAI API]
    Backend --> Resend[Resend Email]
    Backend --> GoogleSheets[Google Sheets API]
    Backend --> GCS[Google Cloud Storage]
    Backend --> Twilio[Twilio SMS]
    Backend --> WeatherAPI[Weather API]
    Backend --> Trello[Trello Webhooks]

    OpenAI -->|GPT-3.5-turbo| QuoteGen[Quote Generation]
    OpenAI -->|Whisper| Transcription[Voice Transcription]
    OpenAI -->|Embeddings| VectorStore[Vector Store]

    Resend -->|HTML Templates| EmailQuotes[Quote Emails]
    Resend -->|HTML Templates| EmailInvoices[Invoice Emails]

    GoogleSheets -->|Customer Data| Sync[Customer Sync]
    GoogleSheets -->|Equipment Data| Equipment[Equipment Pricing]

    GCS -->|File Upload| Attachments[Activity Attachments]

    Twilio -->|SMS| Notifications[Customer Notifications]

    WeatherAPI -->|Forecast Data| Impact[Weather Impact Analysis]

    Trello -->|Voicemail Webhook| VoicemailLog[Voicemail Tracking]
```

## Role-Based Access Control

```mermaid
flowchart TD
    Request([CRM API Request]) --> AuthMiddleware[CRM Auth Middleware]
    AuthMiddleware --> ValidateToken{Token<br/>Valid?}

    ValidateToken -->|No| Error401[401 Unauthorized]
    ValidateToken -->|Yes| GetUserRole[Extract User Role<br/>from crmUsers]

    GetUserRole --> CheckEndpoint{Endpoint Access<br/>Requirements}

    CheckEndpoint -->|Public| Allow[Allow Access]
    CheckEndpoint -->|Admin Only| CheckAdmin{Role >= Manager?}
    CheckEndpoint -->|Sales or Above| CheckSales{Role >= Sales?}
    CheckEndpoint -->|Dispatcher or Above| CheckDispatcher{Role >= Dispatcher?}

    CheckAdmin -->|owner: 100| Allow
    CheckAdmin -->|manager: 80| Allow
    CheckAdmin -->|Lower| Error403[403 Forbidden]

    CheckSales -->|sales: 40+| Allow
    CheckSales -->|tech: 20| Error403
    CheckSales -->|viewer: 10| Error403

    CheckDispatcher -->|dispatcher: 60+| Allow
    CheckDispatcher -->|sales: 40| Error403

    Allow --> ExecuteHandler[Execute Route Handler]
    ExecuteHandler --> Response([Response])

    Error401 --> Response
    Error403 --> Response
```
