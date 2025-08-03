// Modern Email App - script.js

let accessToken = null;
let emails = [];
let currentSection = 'inbox';
let selectedEmail = null;
let chatHistory = [];
let currentCalendarMonth = new Date().getMonth();
let currentCalendarYear = new Date().getFullYear();

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Insyte app initializing...');
    initializeApp();
});

function initializeApp() {
    setupEventListeners();
    checkAuthStatus();
    initializeCalendar();
}

function setupEventListeners() {
    // Auth buttons (always available)
    const loginBtn = document.getElementById('loginBtn');
    const testApiBtn = document.getElementById('testApiBtn');
    
    if (loginBtn) {
        loginBtn.addEventListener('click', authenticateUser);
    }
    
    if (testApiBtn) {
        testApiBtn.addEventListener('click', testGroqApi);
    }

    // Only setup main app listeners if main app exists and is visible
    const mainApp = document.getElementById('mainApp');
    if (mainApp && !mainApp.classList.contains('hidden')) {
        setupMainAppListeners();
    }
}

function setupMainAppListeners() {
    // Navigation
    const sidebarToggle = document.getElementById('sidebarToggle');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    
    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', toggleSidebar);
    }
    
    if (sidebarOverlay) {
        sidebarOverlay.addEventListener('click', closeSidebar);
    }

    // Sidebar navigation items
    document.querySelectorAll('.sidebar-nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const section = item.getAttribute('data-section');
            if (section) {
                showSection(section);
            }
        });
    });

    // Compose button
    const composeBtn = document.getElementById('composeBtn');
    if (composeBtn) {
        composeBtn.addEventListener('click', showCompose);
    }

    // Compose modal
    setupComposeModal();

    // Email actions
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', refreshEmails);
    }

    // Search
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', debounce(handleSearch, 300));
    }

    // Chat
    const chatInput = document.getElementById('chatInput');
    const sendChatBtn = document.getElementById('sendChatBtn');
    
    if (chatInput) {
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendChatMessage();
            }
        });
    }
    
    if (sendChatBtn) {
        sendChatBtn.addEventListener('click', sendChatMessage);
    }

    // Calendar navigation
    const prevMonthBtn = document.getElementById('prevMonthBtn');
    const nextMonthBtn = document.getElementById('nextMonthBtn');
    
    if (prevMonthBtn) {
        prevMonthBtn.addEventListener('click', () => changeMonth(-1));
    }
    
    if (nextMonthBtn) {
        nextMonthBtn.addEventListener('click', () => changeMonth(1));
    }
}

function setupComposeModal() {
    // Only setup compose modal if elements exist
    const composeModal = document.getElementById('composeModal');
    if (!composeModal) {
        console.log('Compose modal not found, skipping setup');
        return;
    }
    
    const closeComposeBtn = document.getElementById('closeComposeBtn');
    const cancelComposeBtn = document.getElementById('cancelComposeBtn');
    const sendBtn = document.getElementById('sendBtn');
    const aiWriteBtn = document.getElementById('aiWriteBtn');
    const grammarCheckBtn = document.getElementById('grammarCheckBtn');
    const attachBtn = document.getElementById('attachBtn');
    const attachmentInput = document.getElementById('attachmentInput');

    if (closeComposeBtn) {
        closeComposeBtn.addEventListener('click', hideCompose);
    }
    
    if (cancelComposeBtn) {
        cancelComposeBtn.addEventListener('click', hideCompose);
    }
    
    if (sendBtn) {
        sendBtn.addEventListener('click', sendEmail);
    }
    
    if (aiWriteBtn) {
        aiWriteBtn.addEventListener('click', aiWrite);
    }
    
    if (grammarCheckBtn) {
        grammarCheckBtn.addEventListener('click', grammarCheck);
    }
    
    if (attachBtn && attachmentInput) {
        attachBtn.addEventListener('click', () => attachmentInput.click());
    }
}

// Authentication
async function authenticateUser() {
    const loginBtn = document.getElementById('loginBtn');
    if (loginBtn) {
        loginBtn.disabled = true;
        loginBtn.innerHTML = '<svg class="w-5 h-5 mr-3 animate-spin" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2v4l3-3 3 3V2h-6z"/></svg>Connecting...';
    }

    try {
        const response = await fetch('/auth/google');
        const data = await response.json();
        
        if (data.success && data.authUrl) {
            window.location.href = data.authUrl;
        } else {
            throw new Error('Failed to get auth URL');
        }
    } catch (error) {
        console.error('Authentication failed:', error);
        if (loginBtn) {
            loginBtn.disabled = false;
            loginBtn.innerHTML = '<svg class="w-5 h-5 mr-3" viewBox="0 0 24 24">...</svg>Continue with Google';
        }
        showNotification('Authentication failed. Please try again.', 'error');
    }
}

function checkAuthStatus() {
    const urlParams = new URLSearchParams(window.location.search);
    const authStatus = urlParams.get('auth');
    const errorMsg = urlParams.get('message');
    
    if (authStatus === 'success') {
        window.history.replaceState({}, document.title, window.location.pathname);
        showMainApp();
        loadEmails();
    } else if (authStatus === 'error') {
        window.history.replaceState({}, document.title, window.location.pathname);
        showNotification('Authentication failed: ' + (errorMsg || 'Unknown error'), 'error');
    }
}

// Email loading and display
async function loadEmails() {
    console.log('📧 Loading emails...');
    showLoadingEmails();

    try {
        const response = await fetch('/api/emails');
        
        if (response.status === 401) {
            showAuthSection();
            return;
        }
        
        const data = await response.json();
        
        if (!data.emails || data.emails.length === 0) {
            hideLoadingEmails();
            showEmptyState();
            return;
        }
        
        emails = data.emails;
        hideLoadingEmails();
        updateStats(data.stats);
        displayEmails(emails);
        
        console.log(`✅ Loaded ${emails.length} emails`);
        
    } catch (error) {
        console.error('Failed to load emails:', error);
        hideLoadingEmails();
        showNotification('Failed to load emails: ' + error.message, 'error');
    }
}

function refreshEmails() {
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.classList.add('animate-spin');
    }
    
    loadEmails().finally(() => {
        if (refreshBtn) {
            refreshBtn.classList.remove('animate-spin');
        }
    });
}

function updateStats(stats) {
    const inboxCount = document.getElementById('inboxCount');
    const emailCount = document.getElementById('emailCount');
    const unreadCount = document.getElementById('unreadCount');
    const notificationBadge = document.getElementById('notificationBadge');
    
    if (inboxCount) inboxCount.textContent = stats.unread || 0;
    if (emailCount) emailCount.textContent = `${stats.total || 0} conversations`;
    if (unreadCount) unreadCount.textContent = `${stats.unread || 0} unread`;
    
    if (notificationBadge) {
        if (stats.unread > 0) {
            notificationBadge.classList.remove('hidden');
        } else {
            notificationBadge.classList.add('hidden');
        }
    }
}

function displayEmails(emailList) {
    const emailListContainer = document.getElementById('emailListContainer');
    
    if (!emailListContainer || !emailList || emailList.length === 0) {
        showEmptyState();
        return;
    }
    
    const emailsHTML = emailList.map(email => {
        const isUrgent = email.urgent || email.priority === 'high';
        const isUnread = email.isUnread;
        const timeAgo = formatTimeAgo(email.date);
        
        return `
            <div class="email-item p-4 border-b border-gray-200 dark:border-gray-700/50 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-all ${isUnread ? 'unread bg-blue-50 dark:bg-blue-900/20' : ''} ${isUrgent ? 'border-l-4 border-l-red-500' : ''}" 
                 onclick="selectEmail('${email.id}')" 
                 data-email-id="${email.id}">
                <div class="flex items-start space-x-3">
                    <div class="w-10 h-10 bg-gradient-to-br from-primary-500 to-primary-600 rounded-full flex items-center justify-center flex-shrink-0">
                        <span class="text-white text-sm font-medium">${getInitials(email.senderName || email.sender)}</span>
                    </div>
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center justify-between mb-1">
                            <p class="text-sm font-semibold text-gray-900 dark:text-dark-text truncate ${isUnread ? 'font-bold' : ''}">${email.senderName || email.sender}</p>
                            <span class="text-xs text-gray-500 dark:text-gray-400">${timeAgo}</span>
                        </div>
                        <p class="text-sm font-medium text-gray-900 dark:text-dark-text mb-1 truncate ${isUnread ? 'font-bold' : ''}">${email.subject}</p>
                        <p class="text-sm text-gray-600 dark:text-gray-300 truncate">${email.content?.substring(0, 100) + '...' || 'No preview available'}</p>
                        <div class="flex items-center mt-2 space-x-2">
                            ${isUrgent ? '<span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300">Urgent</span>' : ''}
                            ${email.summary ? '<span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300">AI Summary</span>' : ''}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    emailListContainer.innerHTML = emailsHTML;
}

function selectEmail(emailId) {
    selectedEmail = emails.find(e => e.id === emailId);
    if (!selectedEmail) return;
    
    // Update UI selection
    document.querySelectorAll('.email-item').forEach(item => {
        item.classList.remove('selected', 'bg-primary-50', 'dark:bg-primary-900/20');
    });
    
    const emailItem = document.querySelector(`[data-email-id="${emailId}"]`);
    if (emailItem) {
        emailItem.classList.add('selected', 'bg-primary-50', 'dark:bg-primary-900/20');
    }
    
    showEmailDetail(selectedEmail);
}

function showEmailDetail(email) {
    const emailDetailView = document.getElementById('emailDetailView');
    const emailDetailContent = document.getElementById('emailDetailContent');
    const emailSubject = document.getElementById('emailSubject');
    const emailSender = document.getElementById('emailSender');
    const emailDate = document.getElementById('emailDate');
    const emailBody = document.getElementById('emailBody');
    const aiSummary = document.getElementById('aiSummary');
    const aiSummaryText = document.getElementById('aiSummaryText');
    
    if (emailDetailView) emailDetailView.classList.add('hidden');
    if (emailDetailContent) emailDetailContent.classList.remove('hidden');
    
    if (emailSubject) emailSubject.textContent = email.subject;
    if (emailSender) emailSender.textContent = email.senderName || email.sender;
    if (emailDate) emailDate.textContent = formatDate(email.date);
    if (emailBody) emailBody.innerHTML = formatEmailContent(email.content);
    
    // Show AI summary if available
    if (email.summary && aiSummary && aiSummaryText) {
        aiSummaryText.textContent = email.summary;
        aiSummary.classList.remove('hidden');
    } else if (aiSummary) {
        aiSummary.classList.add('hidden');
    }
    
    // Setup email action buttons
    setupEmailActions(email);
}

function setupEmailActions(email) {
    const replyBtn = document.getElementById('replyBtn');
    const forwardBtn = document.getElementById('forwardBtn');
    const archiveBtn = document.getElementById('archiveBtn');
    const deleteBtn = document.getElementById('deleteBtn');
    
    if (replyBtn) {
        replyBtn.onclick = () => replyToEmail(email);
    }
    
    if (forwardBtn) {
        forwardBtn.onclick = () => forwardEmail(email);
    }
    
    if (archiveBtn) {
        archiveBtn.onclick = () => archiveEmail(email);
    }
    
    if (deleteBtn) {
        deleteBtn.onclick = () => deleteEmail(email);
    }
}

// Email actions
function replyToEmail(email) {
    showCompose();
    const composeTo = document.getElementById('composeTo');
    const composeSubject = document.getElementById('composeSubject');
    const composeBody = document.getElementById('composeBody');
    
    if (composeTo) composeTo.value = email.sender;
    if (composeSubject) composeSubject.value = 'Re: ' + email.subject;
    if (composeBody) {
        composeBody.value = `\n\n--- Original Message ---\nFrom: ${email.sender}\nSubject: ${email.subject}\n\n${email.content}`;
    }
}

function forwardEmail(email) {
    showCompose();
    const composeSubject = document.getElementById('composeSubject');
    const composeBody = document.getElementById('composeBody');
    
    if (composeSubject) composeSubject.value = 'Fwd: ' + email.subject;
    if (composeBody) {
        composeBody.value = `\n\n--- Forwarded Message ---\nFrom: ${email.sender}\nSubject: ${email.subject}\n\n${email.content}`;
    }
}

async function archiveEmail(email) {
    try {
        const response = await fetch(`/api/emails/${email.id}/archive`, {
            method: 'POST'
        });
        
        if (response.ok) {
            showNotification('Email archived', 'success');
            removeEmailFromList(email.id);
            showEmptyDetail();
        } else {
            throw new Error('Failed to archive email');
        }
    } catch (error) {
        showNotification('Failed to archive email', 'error');
    }
}

async function deleteEmail(email) {
    if (!confirm('Are you sure you want to delete this email?')) return;
    
    try {
        const response = await fetch(`/api/emails/${email.id}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            showNotification('Email deleted', 'success');
            removeEmailFromList(email.id);
            showEmptyDetail();
        } else {
            throw new Error('Failed to delete email');
        }
    } catch (error) {
        showNotification('Failed to delete email', 'error');
    }
}

function removeEmailFromList(emailId) {
    emails = emails.filter(e => e.id !== emailId);
    const emailItem = document.querySelector(`[data-email-id="${emailId}"]`);
    if (emailItem) {
        emailItem.remove();
    }
}

function showEmptyDetail() {
    const emailDetailView = document.getElementById('emailDetailView');
    const emailDetailContent = document.getElementById('emailDetailContent');
    
    if (emailDetailView) emailDetailView.classList.remove('hidden');
    if (emailDetailContent) emailDetailContent.classList.add('hidden');
}

// Navigation
function showSection(sectionName) {
    currentSection = sectionName;
    
    // Hide all sections
    const sections = ['calendarSection', 'chatSection'];
    sections.forEach(sectionId => {
        const section = document.getElementById(sectionId);
        if (section) section.classList.add('hidden');
    });
    
    // Show main app by default
    const mainApp = document.getElementById('mainApp');
    if (mainApp) mainApp.classList.remove('hidden');
    
    // Update section title
    const sectionTitle = document.getElementById('sectionTitle');
    if (sectionTitle) {
        sectionTitle.textContent = sectionName.charAt(0).toUpperCase() + sectionName.slice(1);
    }
    
    // Update active navigation
    document.querySelectorAll('.sidebar-nav-item').forEach(item => {
        item.classList.remove('active');
    });
    
    const activeItem = document.querySelector(`[data-section="${sectionName}"]`);
    if (activeItem) {
        activeItem.classList.add('active');
    }
    
    // Handle special sections
    if (sectionName === 'calendar') {
        if (mainApp) mainApp.classList.add('hidden');
        const calendarSection = document.getElementById('calendarSection');
        if (calendarSection) {
            calendarSection.classList.remove('hidden');
            renderCalendar();
        }
    } else if (sectionName === 'chat') {
        if (mainApp) mainApp.classList.add('hidden');
        const chatSection = document.getElementById('chatSection');
        if (chatSection) chatSection.classList.remove('hidden');
    } else {
        // Load emails for different sections
        loadSectionEmails(sectionName);
    }
    
    // Close sidebar on mobile
    closeSidebar();
}

async function loadSectionEmails(section) {
    // This would filter emails based on section
    // For now, just show all emails
    displayEmails(emails);
}

// Sidebar
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    
    if (sidebar && overlay) {
        sidebar.classList.toggle('-translate-x-full');
        overlay.classList.toggle('hidden');
    }
}

function closeSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    
    if (sidebar && overlay) {
        sidebar.classList.add('-translate-x-full');
        overlay.classList.add('hidden');
    }
}

// Compose
function showCompose() {
    const composeModal = document.getElementById('composeModal');
    if (composeModal) {
        composeModal.classList.remove('hidden');
        composeModal.classList.add('animate-fade-in');
        
        // Focus on the To field
        const composeTo = document.getElementById('composeTo');
        if (composeTo) {
            setTimeout(() => composeTo.focus(), 100);
        }
    }
}

function hideCompose() {
    const composeModal = document.getElementById('composeModal');
    if (composeModal) {
        composeModal.classList.add('hidden');
        composeModal.classList.remove('animate-fade-in');
        
        // Clear form
        const composeTo = document.getElementById('composeTo');
        const composeSubject = document.getElementById('composeSubject');
        const composeBody = document.getElementById('composeBody');
        
        if (composeTo) composeTo.value = '';
        if (composeSubject) composeSubject.value = '';
        if (composeBody) composeBody.value = '';
    }
}

async function sendEmail() {
    const composeTo = document.getElementById('composeTo');
    const composeSubject = document.getElementById('composeSubject');
    const composeBody = document.getElementById('composeBody');
    const sendBtn = document.getElementById('sendBtn');
    
    if (!composeTo?.value || !composeSubject?.value || !composeBody?.value) {
        showNotification('Please fill in all fields', 'warning');
        return;
    }
    
    if (sendBtn) {
        sendBtn.disabled = true;
        sendBtn.innerHTML = '<svg class="w-5 h-5 animate-spin mr-2" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2v4l3-3 3 3V2h-6z"/></svg>Sending...';
    }
    
    try {
        const response = await fetch('/api/send-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                to: composeTo.value,
                subject: composeSubject.value,
                body: composeBody.value
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Email sent successfully!', 'success');
            hideCompose();
        } else {
            throw new Error(data.error || 'Failed to send email');
        }
    } catch (error) {
        console.error('Send email error:', error);
        showNotification('Failed to send email: ' + error.message, 'error');
    } finally {
        if (sendBtn) {
            sendBtn.disabled = false;
            sendBtn.innerHTML = 'Send';
        }
    }
}

// AI Features
async function aiWrite() {
    const composeSubject = document.getElementById('composeSubject');
    const composeBody = document.getElementById('composeBody');
    const aiWriteBtn = document.getElementById('aiWriteBtn');
    
    if (!composeSubject?.value) {
        showNotification('Please enter a subject first for AI to understand the context.', 'warning');
        return;
    }
    
    if (aiWriteBtn) {
        aiWriteBtn.disabled = true;
        aiWriteBtn.innerHTML = '<svg class="w-4 h-4 animate-spin mr-1" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2v4l3-3 3 3V2h-6z"/></svg>Writing...';
    }
    
    try {
        const response = await fetch('/api/ai-write', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                subject: composeSubject.value,
                context: composeBody?.value || ''
            })
        });
        
        const data = await response.json();
        
        if (data.success && composeBody) {
            composeBody.value = data.content;
            showNotification('AI content generated successfully!', 'success');
        } else {
            throw new Error(data.error || 'Failed to generate content');
        }
    } catch (error) {
        console.error('AI Write error:', error);
        showNotification('AI write failed: ' + error.message, 'error');
    } finally {
        if (aiWriteBtn) {
            aiWriteBtn.disabled = false;
            aiWriteBtn.innerHTML = '<svg class="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>AI Write';
        }
    }
}

async function grammarCheck() {
    const composeBody = document.getElementById('composeBody');
    const grammarCheckBtn = document.getElementById('grammarCheckBtn');
    
    if (!composeBody?.value.trim()) {
        showNotification('Please write some content first.', 'warning');
        return;
    }
    
    if (grammarCheckBtn) {
        grammarCheckBtn.disabled = true;
        grammarCheckBtn.innerHTML = '<svg class="w-4 h-4 animate-spin mr-1" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2v4l3-3 3 3V2h-6z"/></svg>Checking...';
    }
    
    try {
        const response = await fetch('/api/grammar-check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: composeBody.value })
        });
        
        const data = await response.json();
        
        if (data.success) {
            composeBody.value = data.correctedContent;
            showNotification('Grammar checked and corrected!', 'success');
        } else {
            throw new Error(data.error || 'Grammar check failed');
        }
    } catch (error) {
        console.error('Grammar check error:', error);
        showNotification('Grammar check failed: ' + error.message, 'error');
    } finally {
        if (grammarCheckBtn) {
            grammarCheckBtn.disabled = false;
            grammarCheckBtn.innerHTML = '<svg class="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>Grammar';
        }
    }
}

// Chat
async function sendChatMessage() {
    const chatInput = document.getElementById('chatInput');
    const message = chatInput?.value.trim();
    
    if (!message) return;
    
    addChatMessage(message, 'user');
    chatInput.value = '';
    
    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message, history: chatHistory })
        });
        
        const data = await response.json();
        
        if (data.success) {
            addChatMessage(data.response, 'ai');
            chatHistory.push({ user: message, ai: data.response });
        } else {
            throw new Error(data.error || 'Chat failed');
        }
    } catch (error) {
        console.error('Chat error:', error);
        addChatMessage('Sorry, I encountered an error. Please try again.', 'ai');
    }
}

function addChatMessage(message, sender) {
    const chatMessages = document.getElementById('chatMessages');
    if (!chatMessages) return;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = 'flex items-start space-x-3 animate-fade-in';
    
    if (sender === 'user') {
        messageDiv.innerHTML = `
            <div class="flex items-start justify-end w-full">
                <div class="bg-primary-500 text-white p-3 rounded-lg max-w-xs">
                    ${message}
                </div>
                <div class="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center ml-2">
                    <span class="text-gray-600 text-sm font-medium">U</span>
                </div>
            </div>
        `;
    } else {
        messageDiv.innerHTML = `
            <div class="w-8 h-8 bg-primary-500 rounded-full flex items-center justify-center">
                <svg class="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                </svg>
            </div>
            <div class="bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-100 p-3 rounded-lg max-w-xs">
                ${message}
            </div>
        `;
    }
    
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Calendar
function initializeCalendar() {
    renderCalendar();
}

function renderCalendar() {
    const calendarGrid = document.getElementById('calendarGrid');
    const calendarTitle = document.getElementById('calendarTitle');
    
    if (!calendarGrid) return;
    
    const today = new Date();
    const firstDay = new Date(currentCalendarYear, currentCalendarMonth, 1).getDay();
    const daysInMonth = new Date(currentCalendarYear, currentCalendarMonth + 1, 0).getDate();
    
    const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];
    
    if (calendarTitle) {
        calendarTitle.textContent = `${monthNames[currentCalendarMonth]} ${currentCalendarYear}`;
    }
    
    // Clear calendar
    calendarGrid.innerHTML = '';
    
    // Add day headers
    const dayHeaders = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    dayHeaders.forEach(day => {
        const dayHeader = document.createElement('div');
        dayHeader.className = 'p-2 text-center font-semibold text-gray-600 dark:text-gray-400 text-sm';
        dayHeader.textContent = day;
        calendarGrid.appendChild(dayHeader);
    });
    
    // Add empty cells for days before month starts
    for (let i = 0; i < firstDay; i++) {
        const emptyDay = document.createElement('div');
        emptyDay.className = 'aspect-square p-2 text-center text-gray-400';
        calendarGrid.appendChild(emptyDay);
    }
    
    // Add days of the month
    for (let day = 1; day <= daysInMonth; day++) {
        const dayElement = document.createElement('div');
        dayElement.className = 'aspect-square p-2 text-center cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors';
        dayElement.textContent = day;
        
        // Highlight today
        if (day === today.getDate() && 
            currentCalendarMonth === today.getMonth() && 
            currentCalendarYear === today.getFullYear()) {
            dayElement.classList.add('bg-primary-500', 'text-white', 'font-bold');
        }
        
        calendarGrid.appendChild(dayElement);
    }
}

function changeMonth(direction) {
    currentCalendarMonth += direction;
    
    if (currentCalendarMonth > 11) {
        currentCalendarMonth = 0;
        currentCalendarYear++;
    } else if (currentCalendarMonth < 0) {
        currentCalendarMonth = 11;
        currentCalendarYear--;
    }
    
    renderCalendar();
}

// Search
function handleSearch(query) {
    if (!query.trim()) {
        displayEmails(emails);
        return;
    }
    
    const filteredEmails = emails.filter(email => 
        email.subject.toLowerCase().includes(query.toLowerCase()) ||
        email.sender.toLowerCase().includes(query.toLowerCase()) ||
        email.content.toLowerCase().includes(query.toLowerCase())
    );
    
    displayEmails(filteredEmails);
}

// API Testing
async function testGroqApi() {
    const testBtn = document.getElementById('testApiBtn');
    const resultDiv = document.getElementById('apiTestResult');
    
    if (testBtn) {
        testBtn.disabled = true;
        testBtn.innerHTML = '<svg class="w-5 h-5 mr-3 animate-spin" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2v4l3-3 3 3V2h-6z"/></svg>Testing API...';
    }
    
    if (resultDiv) {
        resultDiv.classList.remove('hidden');
        resultDiv.innerHTML = 'Testing Groq API connection...';
    }
    
    try {
        const response = await fetch('/api/test-groq');
        const data = await response.json();
        
        if (data.success && resultDiv) {
            resultDiv.innerHTML = `
                <div class="bg-green-100 dark:bg-green-900/30 border border-green-400 dark:border-green-600 text-green-700 dark:text-green-300 px-4 py-3 rounded">
                    <strong>✅ Groq API is working correctly!</strong><br><br>
                    <strong>Sample response:</strong><br>
                    <div class="bg-white dark:bg-gray-800 p-3 rounded mt-2 text-sm">${data.response}</div>
                </div>
            `;
        } else if (resultDiv) {
            resultDiv.innerHTML = `
                <div class="bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-600 text-red-700 dark:text-red-300 px-4 py-3 rounded">
                    <strong>❌ Groq API test failed:</strong><br>
                    <div class="mt-2 text-sm">${data.error || 'Unknown error'}</div>
                </div>
            `;
        }
    } catch (error) {
        if (resultDiv) {
            resultDiv.innerHTML = `
                <div class="bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-600 text-red-700 dark:text-red-300 px-4 py-3 rounded">
                    <strong>❌ Error testing Groq API:</strong><br>
                    <div class="mt-2 text-sm">${error.message || 'Network error'}</div>
                </div>
            `;
        }
    } finally {
        if (testBtn) {
            testBtn.disabled = false;
            testBtn.innerHTML = '<svg class="w-5 h-5 mr-3" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>Test AI Connection';
        }
    }
}

// UI State Management
function showMainApp() {
    const authSection = document.getElementById('authSection');
    const mainApp = document.getElementById('mainApp');
    
    if (authSection) authSection.style.display = 'none';
    if (mainApp) {
        mainApp.classList.remove('hidden');
        // Setup main app event listeners now that it's visible
        setupMainAppListeners();
    }
}

function showAuthSection() {
    const authSection = document.getElementById('authSection');
    const mainApp = document.getElementById('mainApp');
    
    if (authSection) authSection.style.display = 'block';
    if (mainApp) mainApp.classList.add('hidden');
}

function showLoadingEmails() {
    const loadingEmails = document.getElementById('loadingEmails');
    if (loadingEmails) loadingEmails.classList.remove('hidden');
}

function hideLoadingEmails() {
    const loadingEmails = document.getElementById('loadingEmails');
    if (loadingEmails) loadingEmails.classList.add('hidden');
}

function showEmptyState() {
    const emailListContainer = document.getElementById('emailListContainer');
    if (emailListContainer) {
        emailListContainer.innerHTML = `
            <div class="text-center py-12 text-gray-500 dark:text-gray-400">
                <svg class="w-16 h-16 mx-auto mb-4 text-gray-300 dark:text-gray-600" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
                </svg>
                <p class="text-lg font-medium mb-2">No emails found</p>
                <p>Check your Gmail account or try refreshing</p>
            </div>
        `;
    }
}

// Utility functions
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
}

function formatTimeAgo(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);
    
    const intervals = [
        { label: 'year', seconds: 31536000 },
        { label: 'month', seconds: 2592000 },
        { label: 'day', seconds: 86400 },
        { label: 'hour', seconds: 3600 },
        { label: 'minute', seconds: 60 },
        { label: 'second', seconds: 1 }
    ];
    
    for (const interval of intervals) {
        const count = Math.floor(diffInSeconds / interval.seconds);
        if (count > 0) {
            return count === 1 ? `1 ${interval.label} ago` : `${count} ${interval.label}s ago`;
        }
    }
    
    return 'Just now';
}

function formatEmailContent(content) {
    if (!content) return 'No content available';
    
    // Basic HTML formatting
    return content
        .replace(/\n/g, '<br>')
        .replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" class="text-primary-600 hover:underline">$1</a>');
}

function getInitials(name) {
    if (!name) return 'U';
    
    const parts = name.split(' ');
    if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `fixed top-4 right-4 p-4 rounded-lg shadow-lg z-50 transition-all duration-300 transform translate-x-full max-w-sm`;
    
    const colors = {
        success: 'bg-green-500 text-white',
        error: 'bg-red-500 text-white',
        warning: 'bg-yellow-500 text-white',
        info: 'bg-blue-500 text-white'
    };
    
    notification.className += ` ${colors[type] || colors.info}`;
    notification.innerHTML = `
        <div class="flex items-center justify-between">
            <span class="flex-1">${message}</span>
            <button onclick="this.parentElement.parentElement.remove()" class="ml-4 text-white hover:text-gray-200 flex-shrink-0">
                <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/>
                </svg>
            </button>
        </div>
    `;
    
    document.body.appendChild(notification);
    
    // Animate in
    setTimeout(() => {
        notification.classList.remove('translate-x-full');
    }, 100);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        notification.classList.add('translate-x-full');
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 300);
    }, 5000);
}