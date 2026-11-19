/* ============================================================
   NEXUS AI — Static Demo Engine (GitHub Pages)
   يعيد تنفيذ كل الـ API داخل المتصفح على localStorage — لأغراض العرض فقط.
   في النسخة الحقيقية السيرفر node server.js يعمل نفس هذه الـ endpoints.
   ⚠️ كلمات المرور تُخزَّن هنا كنص عادي لأنها حسابات تجريبية عامة.
   ============================================================ */
(function () {
  'use strict';
  if (!window.NEXUS_STATIC) return; // وضع السيرفر: الملف لا يفعل شيئًا
  const LS = 'nexus_static_db_v3';
  const SESSION = 'nexus_static_session_v3';

  // ---------- أدوات ----------
  const nowUtc = (offsetDays = 0) => {
    const d = new Date(Date.now() + offsetDays * 86400000);
    return d.toISOString().slice(0, 19).replace('T', ' ');
  };
  const parseUtc = s => new Date(String(s).replace(' ', 'T') + 'Z');
  const nextId = arr => (arr.length ? Math.max(...arr.map(x => x.id)) : 0) + 1;

  // ---------- الـ seed (نفس داتا النسخة الحية) ----------
  function buildSeed() {
    const departments = [
      { id: 1, name: 'شؤون الطلاب', description: 'القيد، الشهادات، الكارنيهات، العذر والإجازات، التحويلات', sla_hours: 48 },
      { id: 2, name: 'التسجيل والقبول', description: 'تسجيل المقررات، الجداول، الشعب، إعادة التسجيل', sla_hours: 48 },
      { id: 3, name: 'الامتحانات', description: 'لجان الامتحانات، رصد الدرجات، التظلمات، إعادة الرصد', sla_hours: 24 },
      { id: 4, name: 'الشؤون المالية', description: 'المصروفات، الرسوم، الأقساط، الإيصالات', sla_hours: 48 },
      { id: 5, name: 'تكنولوجيا المعلومات', description: 'المنصة الإلكترونية، البريد الجامعي، الواي فاي، الدعم الفني', sla_hours: 24 },
      { id: 6, name: 'المرافق والصيانة', description: 'الكهرباء، التكييف، المياه، المعامل، المباني', sla_hours: 24 },
      { id: 7, name: 'المكتبة', description: 'الاستعارة، الكتب، قواعد البحث العلمي', sla_hours: 72 },
    ];
    const complaint_types = [
      { id: 1, name: 'مشكلة تسجيل مقررات', department_id: 2, keywords: 'تسجيل,ماده,مقرر,شعبة,جدول,سحب,اضافه' },
      { id: 2, name: 'إعادة أو رصد درجات', department_id: 3, keywords: 'رصد,درجه,نتيجه,تظلم,استماره,ورقه' },
      { id: 3, name: 'شكوى مالية / مصروفات', department_id: 4, keywords: 'مصاريف,رسوم,قسط,دفع,ايصال,مالي' },
      { id: 4, name: 'استخراج شهادة / كارنيه', department_id: 1, keywords: 'شهاده,كارنيه,قيد,مستند' },
      { id: 5, name: 'طلب تحويل أو تأجيل', department_id: 1, keywords: 'تحويل,تاجيل,انسحاب,اجازه,عذر' },
      { id: 6, name: 'عطل في المرافق', department_id: 6, keywords: 'صيانه,تكييف,كهرباء,مياه,معمل,مقعد,باب' },
      { id: 7, name: 'مشكلة تقنية بالمنصة', department_id: 5, keywords: 'المنصه,باسورد,بريد,واي فاي,انترنت,الموقع,دخول,ايميل' },
      { id: 8, name: 'مشكلة بالمكتبة', department_id: 7, keywords: 'كتاب,مكتبه,استعاره,مرجع' },
      { id: 9, name: 'شكوى عامة / أخرى', department_id: 1, keywords: '' },
    ];
    const users = [
      { id: 1, name: 'أ/ سامر عادل', email: 'admin@nexus.edu', password: 'admin123', role: 'admin', department_id: null, student_code: null, phone: null, active: 1, last_login: null, created_at: nowUtc(-60) },
      { id: 2, name: 'أ/ منى حسن', email: 'staff@nexus.edu', password: 'staff123', role: 'staff', department_id: 1, student_code: null, phone: null, active: 1, last_login: null, created_at: nowUtc(-60) },
      { id: 3, name: 'م/ كريم فؤاد', email: 'staff-it@nexus.edu', password: 'staff123', role: 'staff', department_id: 5, student_code: null, phone: null, active: 1, last_login: null, created_at: nowUtc(-60) },
      { id: 4, name: 'أ/ هبة رشاد', email: 'staff-reg@nexus.edu', password: 'staff123', role: 'staff', department_id: 2, student_code: null, phone: null, active: 1, last_login: null, created_at: nowUtc(-60) },
      { id: 5, name: 'أ/ محمود نجيب', email: 'staff-exams@nexus.edu', password: 'staff123', role: 'staff', department_id: 3, student_code: null, phone: null, active: 1, last_login: null, created_at: nowUtc(-60) },
      { id: 6, name: 'عمر أشرف', email: 'student@nexus.edu', password: 'student123', role: 'student', department_id: null, student_code: '20230214', phone: null, active: 1, last_login: null, created_at: nowUtc(-60) },
      { id: 7, name: 'سارة محمود', email: 'student2@nexus.edu', password: 'student123', role: 'student', department_id: null, student_code: '20230215', phone: null, active: 1, last_login: null, created_at: nowUtc(-60) },
    ];
    const knowledge_documents = [
      { id: 1, title: 'لائحة شئون الطلاب — التحويل بين المعاهد', source: 'لائحة المعهد العالي للهندسة — إصدار 2025', page: 45, category: 'التسجيل', content: 'يجوز للطالب المقيد بفرقة أولى أو ثانية التحويل من معهد آخر إلى المعهد بناءً على الأعلى درجة، بشرط قضاء سنة دراسية كاملة بنجاح في الفرقة التي ينتقل منها، ومعادلة المواد التي درسها بلجنة المعادلة المختصة. يتم تقديم طلب التحويل خلال الأسبوعين الأولين من الفصل الدراسي مرفقًا بأصل بيان الدرجات والموافقة من المعهد المحول منه، ويخطر الطالب بالقبول خلال أسبوع من تاريخ تقديم الطلب. لا يجوز التحويل في حالة وجود إنذار أكاديمي أو فصل تأديبي سارٍ.' },
      { id: 2, title: 'المستندات المطلوبة للتقديم بالمعهد', source: 'لائحة المعهد العالي للهندسة — إصدار 2025', page: 12, category: 'التسجيل', content: 'أوراق التقديم: 1) أصل شهادة الثانوية العامة أو ما يعادلها مع 3 صور منها، 2) شهادة ميلاد مميكنة وصورتان، 3) 6 صور شخصية حديثة، 4) أصل الإيصال الدال على سداد مصروفات التقديم، 5) استمارة 2 جند للطلاب الذكور، 6) حافظة مستندات بلاستيكية. يتم فتح ملف الطالب بمجرد استلام المستندات ومراجعتها بمعرفة شؤون الطلاب، ويُمنح كارنيه الطالب بعد قيده بالمعهد ويتجدد كل عام دراسي.' },
      { id: 3, title: 'إعادة رصد الدرجات والتظلمات', source: 'قواعد وشروط امتحانات المعهد — إصدار 2025', page: 78, category: 'الامتحانات', content: 'يحق للطالب التقدم بطلب تظلم من درجة مادة خلال 15 يومًا من إعلان النتيجة بسداد رسم التظلم وقدره 150 جنيهًا عن كل مادة. تفتح لجنة التظلمات الأوراق بمعرفة أستاذ المادة الأصلي وأستاذ آخر من نفس القسم، ويخطر الطالب بالنتيجة خلال أسبوعين. في حالة ثبوت خطأ في الرصد يصحح مجانًا وتُرد إليه قيمة الرسم. أما طلبات إعادة الرصد فتحال مباشرة لإدارة الامتحانات دون رسوم.' },
      { id: 4, title: 'الغياب ونسبة الحضور المسموح بها', source: 'لائحة المعهد العالي للهندسة — إصدار 2025', page: 61, category: 'الامتحانات', content: 'يُشترط لحضور الامتحان التحريري اجتياز نسبة حضور لا تقل عن 75% من محاضرات وتمارين كل مادة، و50% كحد أدنى للمعامل لعدم الحرمان. في حالة التجاوز في الغياب تحال حالة الطالب للجنة المختصة وقد يُحرم من دخول الامتحان في المواد التي تجاوز فيها نسبة الغياب. وفي حالة الغياب لعذر قهري (مرضي أو عائلي) يتقدم الطالب بطلب خلال أسبوع من تاريخ الغياب مرفقًا بالمستندات الدالة، وتقبل أصل التقارير الطبية المعتمدة فقط.' },
      { id: 5, title: 'المصروفات الدراسية ومواعيد السداد', source: 'لائحة المعهد العالي للهندسة — إصدار 2025', page: 90, category: 'المالية', content: 'تسدد المصروفات الدراسية على قسطين: القسط الأول عند القيد بداية الفصل الدراسي الأول وقدره 60% من المصروفات، والقسط الثاني بداية الفصل الدراسي الثاني وقدره 40%. آخر موعد للسداد هو نهاية الأسبوع الثالث من بدء الدراسة، وبعده يُحرم الطالب من دخول الامتحان. يحق للطالب الخاص بمعاش تكافل أو ذوي إعاقة التقدم بطلب إعفاء أو تخفيض خلال الأسبوع الأول، ويرفق بإقرار من جهة عمل الولي أو بحث اجتماعي معتمد.' },
      { id: 6, title: 'العذر القهري والإجازة المرضية', source: 'لائحة المعهد العالي للهندسة — إصدار 2025', page: 52, category: 'شؤون الطلاب', content: 'يقبل العذر القهري لعذر مرضي أو وفاة قريب من الدرجة الأولى في حدود أسبوعين كحد أقصى، ويقدم خلال أسبوع من زوال العذر مرفقًا بأصل الشهادة الطبية أو شهادة الوفاة. تُحسب مدة العذر غيابًا بعذر ولا يُحرم الطالب بسببها من الدخول للامتحان بشرط ألا تتجاوز ضعف نسبة الغياب المسموح بها بدون عذر. وفي حالة تكرار العذر القهري أكثر من مرة في الفصل الواحد تحال الحالة لشؤون الطلاب للنظر فيها.' },
      { id: 7, title: 'الانسحاب وتأجيل الدراسة', source: 'لائحة المعهد العالي للهندسة — إصدار 2025', page: 43, category: 'شؤون الطلاب', content: 'يجوز للطالب المنتظم تأجيل الدراسة لمدة فصل دراسي واحد أو دراسي كامل بعذر قهري يقبله عميد المعهد، على ألا تتجاوز مدة التأجيل الكلية فصلين دراسيين في المرحلة الواحدة. يقدم الطلب خلال أسبوعين من بداية الفصل الدراسي مرفقًا بالمستندات الدالة على العذر، ويتم الاحتفاظ بمقعد الطالب بالمعهد، ولا تحتسب مدة التأجيل ضمن الحد الأقصى للدراسة.' },
      { id: 8, title: 'الدعم الفني للمنصة الإلكترونية', source: 'دليل الطالب للمنصة الذكية — إصدار 2026', page: 8, category: 'تكنولوجيا المعلومات', content: 'يقدم الدعم الفني المساعدة في: استعادة كلمة المرور عبر "نسيت كلمة المرور" على صفحة الدخول، تفعيل البريد الجامعي، مشاكل تسجيل الدخول للمنصة، وأخطاء رفع الواجبات أو المشاريع التي تظهر برسائل باللون الأحمر. في الحالات المستعصية يتواصل الطالب مع مركز الدعم بالإدارة المركزية من 9 صباحًا حتى 4 عصرًا أيام العمل الرسمية عبر نموذج تذكرة داخل المنصة أو على الرقم الداخلي 114.' },
      { id: 9, title: 'نظام استعارة الكتب من المكتبة', source: 'لائحة المكتبة المركزية — إصدار 2025', page: 3, category: 'المكتبة', content: 'يحق لطالب الفرقة الأولى استعارة كتابين كحد أقصى لمدة أسبوع، ويحق لطالب فرق السنة الثانية فأعلى استعارة 4 كتب لمدة أسبوعين قابلة للتجديد مرة واحدة في حالة عدم وجود طلب عليها. تقرر غرامة تأخير 5 جنيهات عن كل كتاب عن كل يوم تأخير، وتمنع الاستعارة من لا يسدد الغرامات. ولا يجوز استعارة المراجع والكتب النادرة خارج المكتبة وتتاح للاطلاع الداخلي فقط.' },
      { id: 10, title: 'درجات أعمال السنة وتقسيم المجموع', source: 'قواعد وشروط امتحانات المعهد — إصدار 2025', page: 70, category: 'الامتحانات', content: 'تتوزع درجة المادة الواحدة (100) كالتالي: 15 درجة اختبار قصير، 10 درجات واجبات وحضور، 75 درجة امتحان نهاية الفصل. درجة النجاح في كل مادة 60%. لا تحتسب أعمال السنة في حالة الحرمان من الامتحان التحريري. يعتمد عميد المعهد نتائج الامتحانات بعد مراجعة لجنة الكنترول، ويحق لكل طالب الاطلاع على إجابته بمظروف بعد إعلان النتيجة بأسبوع حتى نهاية التظلم.' },
      { id: 11, title: 'Transfer between institutes — regulations', source: 'English Regulations of the High Institute of Engineering — 2025', page: 46, category: 'التسجيل', content: 'Students may transfer from another institute to the High Institute of Engineering after completing at least one full academic year with success at the highest grade level. Equivalency of previously studied courses is decided by the Equivalency Committee. Applications are accepted within the first two weeks of the semester, accompanied by an original academic transcript and an approval letter from the original institute. Transfer is not permitted while an academic warning or a disciplinary dismissal is in effect.' },
      { id: 12, title: 'Examination rules and resit applications', source: 'English Examination Rules of the High Institute of Engineering — 2025', page: 79, category: 'الامتحانات', content: 'A student may request a review of marked examination scripts within 15 days of result publication upon payment of a review fee of EGP 150 per course. The review board consists of the original course instructor and another senior academic from the same department. If an error in marking is proven, the grade is corrected free of charge and the fee is refunded. Requests to have practical examination grades restored are referred directly to the Examinations Office without fees.' },
      { id: 13, title: 'Library borrowing regulations', source: 'Central Library Regulations — 2025', page: 4, category: 'المكتبة', content: 'First-year students may borrow up to two books for one week. Students in second year and above may borrow up to four books for two weeks, renewable once if no other request exists. A daily delay fine of EGP 5 applies per book. Students with unpaid fines are not permitted to borrow. Rare reference works may not leave the library and are available for internal consultation only.' },
    ];
    // [title, details, typeName, deptId, studentId, assignedId, daysAgo, status, priority, rating?]
    const samples = [
      ['مش قادر أسجل مادة رسم هندسي والشعب مقفولة', 'حاولت أسجل مادة الرسم الهندسي للفرقة الثانية بس النظام بيقول الشعب مكتملة رغم إني لسه فاتح التسجيل بدري، ومش عارف أتصرف لأني بحتاج المادة عشان أدخل الامتحان', 1, 2, 6, 4, 1, 'in_progress', 'urgent'],
      ['مشكلة في دفع القسط التاني على المنصة', 'عندي القسط التاني ومحاولة الدفع بتظهر رسالة "العملية مرفوضة من البنك"، وإيصال الصرف اتخصم مش عارف هو راح فين', 3, 4, 6, null, 2, 'new', 'high'],
      ['مش ظاهر درجاتي في نتيجة نهاية العام', 'نتيجة الفصل التاني ظهرت ومش لاقي مادة رياضيات 2، ولازم التظلم قبل نهاية الأسبوع', 2, 3, 6, 5, 3, 'in_progress', 'high'],
      ['طلب استخراج شهادة قيد', 'محتاج شهادة قيد للمكان اللي هقدم فيه على الكامب الصيفي، ياريت تجهز خلال يومين لو ينفع', 4, 1, 6, 2, 5, 'resolved', 'medium', 5],
      ['تكييف القاعة 3 سايبة مش شغال', 'من أول الأسبوع التكييف مش شغال في قاعة 3 وحضور المحاضرات صعب، فيه محاضرات وأعمال العام برضه', 6, 6, 6, null, 6, 'in_progress', 'medium'],
      ['نسيت كلمة مرور المنصة وحضرت امتحان إلكتروني', 'كلمة المرور مش بتفتح واليوم عندي اختبار إلكتروني ومحدش بيرد من الدعم', 7, 5, 6, 3, 8, 'resolved', 'urgent', 5],
      ['عذر قهري عن غياب محاضرة لظرف صحي', 'غبت عن محاضرات الثلاثاء بسبب وعكة صحية وعندي تقرير طبي معتمد، ياريت يتسجلي عذر عشان الغياب ميتحسبش', 5, 1, 6, 2, 9, 'resolved', 'medium', 4],
      ['محتاج كارنيه بدل فاقد', 'كارنية المعهد ضاع مني في الأتوبيس، محتاج بدل فاقد وأبقى أراجع الإجراءات والأوراق المطلوبة', 4, 1, 6, 2, 12, 'resolved', 'low', 5],
      ['التسجيل بوافي عندي مشكلة في سحب الشعبة', 'حابب أسيب شعبة الصباحي للتسجيل المتأخر، كل ما أضغط سحب النظام بيرجع بخطأ غريب', 1, 2, 6, 4, 14, 'resolved', 'low', 4],
      ['رسيت في مادة بقيت أحاول أرفع تظلم', 'مادة ث ثابتة 58 وأنا شايفها أعلى، محتاج أقدم تظلم رسمي بس مش عارف الإجراءات', 2, 3, 6, 5, 16, 'resolved', 'medium', 5],
      ['الواي فاي في مبنى ب مش شغال من الصبح', 'النت مش شغال في مبنى ب، ولا أقدر أحمل الملفات على جروب المحاضرات', 7, 5, 6, 3, 20, 'resolved', 'medium', 4],
      ['مقعدي في القاعة مكسور', 'كرسي في الصف الأخير قاعة 2 مكسور تمامًا، محتاج يتصلحلحد حد ما حد يزق عليه', 6, 6, 6, null, 24, 'rejected', 'low'],
      ['تأخر استلام شهادة التخرج موقتًا', 'عندي استلام شهادة وهم يتأخروا في التجهيز، الكلية ورقالية واتصلت ومحدش عاود', 4, 1, 7, 2, 2, 'new', 'medium'],
      ['معايا مشكلة في رسوم التأجيل', 'حابب أأجل الفصل والتاجيل بيخصم رسوم، مش عارف المبلغ ومين اللي بيحدد', 3, 4, 7, null, 4, 'new', 'medium'],
      ['معمل الميكاترونيكس فيه تكييف باظ', 'معمل الميكاترونيكس سايب التكييف مطفي من أسبوعين، طلبة الفرقتين الثالثة والرابعة بيشتكوا', 6, 6, 7, null, 7, 'in_progress', 'medium'],
      ['عندي مشكلة في مادة الرسم 2 تسجيل', 'مش قادر أسجل مادة الرسم 2 ولو مش هضاف هبقى محروم منها السنة الجاية', 1, 2, 7, 4, 10, 'in_progress', 'high'],
      ['خطأ في اسم الشهادة المبدئي', 'في شهادة القيد اسمي "سارة محممود" بحرف ميم زيادة، محتاجة تتصلحلحد بسرعة', 4, 1, 7, 2, 15, 'resolved', 'high', 4],
      ['مشكلة في الدخول لجروب المادة على المنصة', 'مش عارف أدخل جروب الرسم على المنصة وبحاول من امبارح، عندي محاضرة المونداي', 7, 5, 7, 3, 19, 'resolved', 'medium', 5],
      ['الكتاب اللي عاوزه مش موجود في المكتبة', 'كتاب المقاومة والمواد المقدرة مش موجود ولا حتى مرجع واحد، مكتبة القسم رفوف فاضية', 8, 7, 7, null, 21, 'resolved', 'low', 3],
      ['محتاج تظلم رسمي في مادة كهرباء', 'نتيجة مادة المحركات طلعت 55 وزي ما قولت للدكتور أنا باقي 45 في الأسئلة السهلة', 2, 3, 7, 5, 26, 'resolved', 'medium', 4],
      ['عندي استفسار بخصوص الأقساط', 'عندي قسط المصروفات ودفعته الجمعة والعملية لسه معلقة على المنصة لحد دلوقتي', 3, 4, 7, null, 27, 'in_progress', 'medium'],
      ['الإضاءة في طرقة الدور التاني ضعيفة', 'لمبات طرقة الدور التاني في المبنى الإداري نصفها بايظ، والطلاب بيبقوا في ضلمة آخر اليوم', 6, 6, 7, null, 30, 'new', 'low'],
      ['طلب تأجيل فصل لعذر عائلي', 'عندي ظروف عائلية تستدعي تأجيل فصل كامل، حابب أعرف الإجراءات والورق المطلوب', 5, 1, 7, 2, 33, 'resolved', 'medium', 5],
      ['التأخر في رصد درجة المعمل', 'معمل الاتصالات الدوائر بتاعتي اتصلحلحد من قبل ماطلع بس الدرجة لسه ما ظهرتش', 2, 3, 7, 5, 36, 'resolved', 'medium', 4],
      ['غبت عن امتحان تكميلي رغم الإجازة', 'عندي إجازة مرضية معتمدة من المستشفى بأيام الامتحان التكميلي، وخايف من الحرمان', 5, 1, 6, 2, 40, 'resolved', 'high', 5],
      ['تكييف القاعة الرئيسية مش شغال وقت الامتحان', 'قاعة الامتحان الرئيسي القاعة الكبيرة التكييف مش شغال والحر داخل مش محتمل', 6, 6, 6, null, 44, 'resolved', 'high', 5],
      ['مش قادر أحمل ملف المشروع على المنصة', 'برفع ملف مشروع الشبكات وبيقول نوع الملف غير مدعوم، الملف PDF وحجمه 8 ميجا', 7, 5, 6, 3, 48, 'resolved', 'medium', 4],
      ['محتاج كارنيه الطالب بدل ضائع', 'ضاع مني الكارنيه من شهر وعايز بدل تاني', 4, 1, 6, 2, 52, 'resolved', 'low', 4],
    ];
    const typeName = id => complaint_types.find(t => t.id === id).name;
    const complaints = [], complaint_updates = [], messages = [];
    let cid = 0;
    for (const [title, details, typeId, deptId, studentId, assignedId, daysAgo, status, priority, rating] of samples) {
      cid += 1;
      const created = nowUtc(-daysAgo);
      const resolved = status === 'resolved' ? nowUtc(-Math.max(daysAgo - 2, 0)) : null;
      complaints.push({ id: cid, ticket_no: `NX-2026-${String(cid).padStart(4, '0')}`, student_id: studentId, type_id: typeId, department_id: deptId, assigned_to: assignedId, title, details, attachment: null, status, priority, ai_category: typeName(typeId), ai_confidence: 0.72 + ((cid * 37) % 20) / 100, rating: rating ?? null, created_at: created, updated_at: resolved || created, resolved_at: resolved });
      complaint_updates.push({ id: complaint_updates.length + 1, complaint_id: cid, user_id: studentId, action: 'created', details: 'تم إنشاء الشكوى', created_at: created });
      if (assignedId) complaint_updates.push({ id: complaint_updates.length + 1, complaint_id: cid, user_id: 1, action: 'assigned', details: 'تم إحالة الشكوى للموظف المختص', created_at: created });
      if (status === 'resolved') {
        complaint_updates.push({ id: complaint_updates.length + 1, complaint_id: cid, user_id: assignedId || 2, action: 'status', details: 'تم تغيير الحالة إلى: تم الحل', created_at: resolved });
        messages.push({ id: messages.length + 1, complaint_id: cid, sender_id: assignedId || 2, body: 'أهلًا! تم استلام شكواك ومراجعتها والانتهاء من الإجراء اللازم. لو احتجت أي حاجة تانية أنا موجود.', is_internal: 0, created_at: nowUtc(-Math.max(daysAgo - 1, 0)) });
      } else if (status === 'in_progress') {
        messages.push({ id: messages.length + 1, complaint_id: cid, sender_id: assignedId || 2, body: 'الشكوى وصلت وقيد المراجعة حاليًا، هنوافيك بالتحديثات أول بأول.', is_internal: 0, created_at: created });
      }
    }
    const notifications = [
      { id: 1, user_id: 6, title: 'تم حل شكواك 🎉', body: 'تم حل مشكلتك بخصوص "طلب استخراج شهادة قيد" — قيّم التجربة من داخل الشكاوى', ref_type: 'complaint', ref_id: 4, read: 0, created_at: nowUtc(-3) },
      { id: 2, user_id: 2, title: 'شكوى جديدة بانتظار المراجعة', body: 'NX-2026-0012 — تأخر استلام شهادة التخرج موقتًا', ref_type: 'complaint', ref_id: 13, read: 0, created_at: nowUtc(-2) },
      { id: 3, user_id: 2, title: 'شكوى جديدة بانتظار المراجعة', body: 'NX-2026-0004 — طلب استخراج شهادة قيد', ref_type: 'complaint', ref_id: 4, read: 1, created_at: nowUtc(-5) },
    ];
    // ---------- الخدمات الأكاديمية ----------
    const timetable = [
      { id: 1, day: 'السبت', start_time: '09:00', end_time: '11:00', course: 'قواعد البيانات', doctor: 'د/ أسامة فؤاد', room: 'قاعة ب12', course_code: 'CS-201' },
      { id: 2, day: 'الأحد', start_time: '11:00', end_time: '13:00', course: 'برمجة كائنية التوجه', doctor: 'د/ منى عوض', room: 'معمل 3', course_code: 'CS-202' },
      { id: 3, day: 'الاثنين', start_time: '09:00', end_time: '11:00', course: 'شبكات الحاسب', doctor: 'د/ حازم نبيل', room: 'قاعة أ7', course_code: 'CS-203' },
      { id: 4, day: 'الثلاثاء', start_time: '13:00', end_time: '15:00', course: 'الرياضيات المتقدمة 2', doctor: 'د/ رانيا سمير', room: 'قاعة ب4', course_code: 'MA-204' },
      { id: 5, day: 'الأربعاء', start_time: '09:00', end_time: '11:00', course: 'رسم هندسي', doctor: 'د/ علي منصور', room: 'معمل الرسم', course_code: 'EN-205' },
      { id: 6, day: 'الخميس', start_time: '11:00', end_time: '13:00', course: 'قواعد البيانات — تمارين', doctor: 'م/ هبة رشاد', room: 'معمل 2', course_code: 'CS-201T' },
    ];
    const exams = [
      { id: 1, course: 'قواعد البيانات', exam_date: nowUtc(3), room: 'قاعة ب12', duration_minutes: 120 },
      { id: 2, course: 'برمجة كائنية التوجه', exam_date: nowUtc(9), room: 'معمل 3', duration_minutes: 90 },
      { id: 3, course: 'شبكات الحاسب', exam_date: nowUtc(16), room: 'قاعة أ7', duration_minutes: 120 },
      { id: 4, course: 'الرياضيات المتقدمة 2', exam_date: nowUtc(23), room: 'قاعة ب4', duration_minutes: 90 },
    ];
    const grades = [
      { id: 1, student_id: 6, course: 'قواعد البيانات', credit_hours: 4, score: 84, semester: '2025/2026 - فصل أول' },
      { id: 2, student_id: 6, course: 'برمجة كائنية التوجه', credit_hours: 4, score: 91, semester: '2025/2026 - فصل أول' },
      { id: 3, student_id: 6, course: 'شبكات الحاسب', credit_hours: 3, score: 66, semester: '2025/2026 - فصل أول' },
      { id: 4, student_id: 6, course: 'الرياضيات المتقدمة 2', credit_hours: 3, score: 78, semester: '2025/2026 - فصل أول' },
      { id: 5, student_id: 6, course: 'رسم هندسي', credit_hours: 2, score: 88, semester: '2025/2026 - فصل أول' },
      { id: 6, student_id: 6, course: 'مقرر فني في الهندسة', credit_hours: 2, score: 73, semester: '2025/2026 - فصل أول' },
      { id: 7, student_id: 7, course: 'قواعد البيانات', credit_hours: 4, score: 77, semester: '2025/2026 - فصل أول' },
      { id: 8, student_id: 7, course: 'برمجة كائنية التوجه', credit_hours: 4, score: 85, semester: '2025/2026 - فصل أول' },
      { id: 9, student_id: 7, course: 'شبكات الحاسب', credit_hours: 3, score: 71, semester: '2025/2026 - فصل أول' },
      { id: 10, student_id: 7, course: 'الرياضيات المتقدمة 2', credit_hours: 3, score: 62, semester: '2025/2026 - فصل أول' },
      { id: 11, student_id: 7, course: 'رسم هندسي', credit_hours: 2, score: 90, semester: '2025/2026 - فصل أول' },
      { id: 12, student_id: 7, course: 'مقرر فني في الهندسة', credit_hours: 2, score: 68, semester: '2025/2026 - فصل أول' },
    ];
    const fees = [
      { id: 1, student_id: 6, term: 'فصل أول 2025/2026', label: 'القسط التاني — المصروفات الدراسية', amount: 25200, paid: 25200, due_date: '2026-02-15' },
      { id: 2, student_id: 6, term: 'فصل أول 2025/2026', label: 'التأمين والأوراق', amount: 1500, paid: 1500, due_date: '2025-09-20' },
      { id: 3, student_id: 6, term: 'فصل ثاني 2026', label: 'القسط الأول — المصروفات الدراسية', amount: 25200, paid: 0, due_date: '2026-03-01' },
      { id: 4, student_id: 7, term: 'فصل أول 2025/2026', label: 'القسط التاني — المصروفات الدراسية', amount: 25200, paid: 16800, due_date: '2026-02-15' },
      { id: 5, student_id: 7, term: 'فصل أول 2025/2026', label: 'التأمين والأوراق', amount: 1500, paid: 1500, due_date: '2025-09-20' },
      { id: 6, student_id: 7, term: 'فصل ثاني 2026', label: 'القسط الأول — المصروفات الدراسية', amount: 25200, paid: 0, due_date: '2026-03-01' },
    ];
    const attendance_stats = [
      { id: 1, student_id: 6, course: 'قواعد البيانات', attended: 22, total: 24 },
      { id: 2, student_id: 6, course: 'برمجة كائنية التوجه', attended: 23, total: 24 },
      { id: 3, student_id: 6, course: 'شبكات الحاسب', attended: 19, total: 24 },
      { id: 4, student_id: 6, course: 'الرياضيات المتقدمة 2', attended: 20, total: 22 },
      { id: 5, student_id: 6, course: 'رسم هندسي', attended: 21, total: 22 },
      { id: 6, student_id: 6, course: 'مقرر فني في الهندسة', attended: 20, total: 22 },
      { id: 7, student_id: 7, course: 'قواعد البيانات', attended: 21, total: 24 },
      { id: 8, student_id: 7, course: 'برمجة كائنية التوجه', attended: 24, total: 24 },
      { id: 9, student_id: 7, course: 'شبكات الحاسب', attended: 18, total: 24 },
      { id: 10, student_id: 7, course: 'الرياضيات المتقدمة 2', attended: 16, total: 22 },
      { id: 11, student_id: 7, course: 'رسم هندسي', attended: 22, total: 22 },
      { id: 12, student_id: 7, course: 'مقرر فني في الهندسة', attended: 21, total: 22 },
    ];
    const announcements = [
      { id: 1, admin_id: 1, title: 'انطلاق الفصل الدراسي الثاني — جدول المحاضرات متاح', body: 'نود إحاطتكم بأنه تم فتح جداول المحاضرات والامتحانات النهائية على المنصة، والرجاء الالتزام بنسبة حضور لا تقل عن 75%، والحضور عبر QR يوم كل محاضرة.', audience: 'all', created_at: nowUtc(-1) },
    ];
    notifications.push({ id: 4, user_id: 6, title: '📢 إعلان جامعي جديد', body: 'انطلاق الفصل الدراسي الثاني — راجع البانر في الرئيسية', ref_type: 'announcement', ref_id: 1, read: 0, created_at: nowUtc(-1) });
    notifications.push({ id: 5, user_id: 7, title: '📢 إعلان جامعي جديد', body: 'انطلاق الفصل الدراسي الثاني — راجع البانر في الرئيسية', ref_type: 'announcement', ref_id: 1, read: 0, created_at: nowUtc(-1) });
    const lost_found = [
      { id: 1, student_id: 7, type: 'lost', title: 'شنطة سوداء فيها لابتوب', description: 'شنطة لابتوب سوداء عليها ملصق «هندسة بيانات» فُقدت جنب كافتيريا المبنى الرئيسي، فيها لابتوب ديل + شاحن + دفاتر.', category: 'إلكترونيات', location: 'الكافتيريا — المبنى الرئيسي', item_date: '2026-11-12', image: null, status: 'open', created_at: nowUtc(-6) },
      { id: 2, student_id: 6, type: 'found', title: 'كارنيه طالب (سارة محمود)', description: 'تم العثور على كارنيه طالب باسم سارة محمود رقم جامعي 20230215 في ممرات مبنى ب بجوار قاعة 4.', category: 'أوراق وبطاقات', location: 'مبنى ب — الدور الأول', item_date: '2026-11-15', image: null, status: 'open', created_at: nowUtc(-3) },
      { id: 3, student_id: 7, type: 'lost', title: 'مفتاح سيارة تويوتا', description: 'مفتاح سيارة تويوتا كامري على حلقة جلدية بني، ضاع في جراج المعهد أو أمام البوابة الشمالية.', category: 'مفاتيح', location: 'الجراج / البوابة الشمالية', item_date: '2026-11-10', image: null, status: 'open', created_at: nowUtc(-8) },
    ];
    // الشكاوى المحلولة + المقيّمة تعتبر مغلقة تلقائيًا
    for (const c of complaints) { if (c.rating && !c.closure_status) c.closure_status = 'confirmed'; }
    return { meta: { nextComplaint: cid + 1, nextRow: 1000 }, departments, complaint_types, users, complaints, complaint_updates, messages, notifications, ai_conversations: [], knowledge_documents, reports: [], timetable, exams, grades, fees, attendance_stats, attendance_sessions: [], attendance_records: [], announcements, lost_found, lost_found_contacts: [], document_analyses: [] };
  }

  function loadDb() {
    try {
      const raw = localStorage.getItem(LS);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* corrupted → reseed */ }
    const seed = buildSeed();
    saveDb(seed);
    return seed;
  }
  function saveDb(db) { localStorage.setItem(LS, JSON.stringify(db)); }
  let DB = loadDb();

  // إعادة ضبط الداتا التجريبية (تُستخدم من زر في صفحة الدخول)
  window.nexusResetStaticDemo = function () {
    localStorage.removeItem(LS); localStorage.removeItem(SESSION);
    location.reload();
  };

  // ---------- أدوات مشتركة ----------
  const ok = (data, status = 200) => ({ status, ok: true, data });
  const fail = (status, error) => ({ status, ok: false, error });
  const findUser = id => DB.users.find(u => u.id === id) || null;
  function publicUser(u) {
    if (!u) return null;
    const dept = u.department_id ? DB.departments.find(d => d.id === u.department_id) : null;
    return { id: u.id, name: u.name, email: u.email, role: u.role, department_id: u.department_id, department_name: dept ? dept.name : null, student_code: u.student_code, phone: u.phone, active: !!u.active, last_login: u.last_login, created_at: u.created_at };
  }
  const sessionUser = () => {
    const id = Number(localStorage.getItem(SESSION) || 0);
    const u = id ? findUser(id) : null;
    return u && u.active ? u : null;
  };
  const canSeeComplaint = (user, c) => !c ? false : user.role === 'admin' ? true : user.role === 'student' ? c.student_id === user.id : (c.department_id === user.department_id || c.assigned_to === user.id);
  const loadComplaint = id => {
    const c = DB.complaints.find(x => x.id === id);
    if (!c) return null;
    const t = DB.complaint_types.find(x => x.id === c.type_id);
    const d = DB.departments.find(x => x.id === c.department_id);
    const s = findUser(c.student_id);
    const a = c.assigned_to ? findUser(c.assigned_to) : null;
    return { ...c, type_name: t ? t.name : null, department_name: d ? d.name : null, student_name: s ? s.name : null, student_code: s ? s.student_code : null, student_email: s ? s.email : null, assigned_name: a ? a.name : null };
  };
  const notify = (userId, title, body, refType, refId) => {
    DB.notifications.push({ id: nextId(DB.notifications), user_id: userId, title, body: body || null, ref_type: refType || null, ref_id: refId || null, read: 0, created_at: nowUtc() });
  };
  const logUpdate = (cid, uid, action, details) => {
    DB.complaint_updates.push({ id: nextId(DB.complaint_updates), complaint_id: cid, user_id: uid, action, details: details || null, created_at: nowUtc() });
  };
  const STATUS_LABEL = { new: 'جديدة', in_progress: 'قيد المراجعة', resolved: 'تم الحل', rejected: 'مرفوضة' };

  // ---------- الذكاء الاصطناعي (نفس منطق ai.js) ----------
  function normalizeArabic(text) {
    return String(text || '').toLowerCase()
      .replace(/[ً-ٰٟ]/g, '').replace(/ـ/g, '')
      .replace(/[أإآا]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
      .replace(/[^؀-ۿa-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  const tokens = t => normalizeArabic(t).split(' ').filter(x => x.length > 1);
  const CATEGORIES = [
    { category: 'مشكلة تسجيل مقررات', dept: 'التسجيل والقبول', keywords: { 'تسجيل': 3, 'مقرر': 3, 'ماده': 2, 'شعب': 2, 'جدول': 2, 'سحب': 2, 'اضافه': 2, 'حذف': 1, 'شعبة': 2 } },
    { category: 'إعادة أو رصد درجات', dept: 'الامتحانات', keywords: { 'رصد': 3, 'درجه': 2, 'نتيجه': 3, 'تظلم': 3, 'ورقه': 2, 'استماره': 2, 'امتحان': 2, 'رسيت': 2, 'الكنترول': 2, 'معمل': 1 } },
    { category: 'شكوى مالية / مصروفات', dept: 'الشؤون المالية', keywords: { 'مصاريف': 3, 'رسوم': 3, 'قسط': 3, 'دفع': 2, 'ايصال': 2, 'مالي': 2, 'فلوس': 1, 'البنك': 2, 'خصم': 1 } },
    { category: 'استخراج شهادة / كارنيه', dept: 'شؤون الطلاب', keywords: { 'شهاده': 3, 'كارنيه': 3, 'قيد': 2, 'مستند': 2, 'بدل فاقد': 3, 'ورقه رسميه': 2 } },
    { category: 'طلب تحويل أو تأجيل', dept: 'شؤون الطلاب', keywords: { 'تحويل': 3, 'تاجيل': 3, 'اجاز': 2, 'عذر': 3, 'انسحاب': 2, 'اجازه': 2, 'تأجيل': 3 } },
    { category: 'عطل في المرافق', dept: 'المرافق والصيانة', keywords: { 'صيانه': 3, 'تكييف': 3, 'كهرباء': 3, 'مياه': 2, 'معمل': 2, 'كرسي': 2, 'مقعد': 2, 'باب': 1, 'سبور': 2, 'اضاءه': 2, 'لمبه': 2, 'مبني': 1 } },
    { category: 'مشكلة تقنية بالمنصة', dept: 'تكنولوجيا المعلومات', keywords: { 'المنصه': 3, 'باسورد': 3, 'كلمه المرور': 3, 'بريد': 2, 'ايميل': 2, 'واي فاي': 3, 'انترنت': 2, 'الموقع': 2, 'دخول': 1, 'الملف': 1, 'الجامعيه': 1 } },
    { category: 'مشكلة بالمكتبة', dept: 'المكتبة', keywords: { 'كتاب': 3, 'مكتبه': 3, 'استعاره': 3, 'مرجع': 2 } },
  ];
  const URGENT_WORDS = ['عاجل', 'طارئ', 'فوري', 'بكره', 'اليوم', 'امتحان', 'الحرمان', 'الدعم', 'ساعه', 'فورًا'];
  const HIGH_WORDS = ['بسرعه', 'قريب', 'قبل الامتحان', 'الاسبوع ده', 'لسه ما ظهرتش', 'محروق'];
  const CRITICAL_WORDS = ['حرمان', 'امتحان بكرة', 'الامتحان بكرة', 'قبل الامتحان', 'النهاردة امتحان', 'بكرة امتحان'];
  function classifyComplaint(text) {
    const norm = normalizeArabic(text);
    const scores = CATEGORIES.map(cat => {
      let score = 0; const matched = [];
      for (const [kw, w] of Object.entries(cat.keywords)) {
        const nkw = normalizeArabic(kw);
        if (nkw && norm.includes(nkw)) { score += w; matched.push(kw); }
      }
      return { ...cat, score, matched };
    }).sort((a, b) => b.score - a.score);
    const best = scores[0];
    const matchCount = best ? best.matched.length : 0;
    const matchedSomething = !!(best && best.score > 0);
    const confidence = matchedSomething
      ? Math.min(0.95, 0.4 + Math.min(best.score, 8) * 0.06 + (matchCount >= 3 ? 0.1 : matchCount === 2 ? 0.05 : 0))
      : 0.3;
    const urgent = URGENT_WORDS.some(w => norm.includes(normalizeArabic(w)));
    const critical = CRITICAL_WORDS.some(w => norm.includes(normalizeArabic(w)));
    const high = !urgent && !critical && HIGH_WORDS.some(w => norm.includes(normalizeArabic(w)));
    const priority = critical ? 'critical' : urgent ? 'urgent' : high ? 'high' : best && best.score >= 3 ? 'medium' : 'low';
    const dept = DB.departments.find(d => d.name === (matchedSomething ? best.dept : 'شؤون الطلاب')) || DB.departments[0];
    return { category: matchedSomething ? best.category : 'شكوى عامة / أخرى', department_id: dept.id, department_name: dept.name, priority, urgent, is_urgent: urgent, critical, confidence: Math.round(confidence * 100) / 100, matched_keywords: matchedSomething ? best.matched : [] };
  }
  function searchKnowledge(query, topN = 3) {
    const qTokens = tokens(query);
    if (!qTokens.length) return [];
    return DB.knowledge_documents.map(doc => {
      const docContent = normalizeArabic(doc.content), docTitle = normalizeArabic(doc.title);
      let score = 0; const tf = {};
      for (const t of tokens(doc.content + ' ' + doc.title)) tf[t] = (tf[t] || 0) + 1;
      for (const qt of qTokens) {
        const freq = tf[qt] || 0;
        if (freq) score += 1 + Math.log(freq + 1);
        if (docTitle.includes(qt)) score += 2.5;
      }
      return { doc, score };
    }).filter(s => s.score > 0).sort((a, b) => b.score - a.score).slice(0, topN);
  }
  function extractAnswer(doc, query) {
    const qTokens = new Set(tokens(query));
    const sentences = String(doc.content).split(/[.،\n]+/).map(s => s.trim()).filter(s => s.length > 25);
    let best = null, bestScore = -1;
    for (const s of sentences) { const st = tokens(s); let sc = 0; for (const t of st) if (qTokens.has(t)) sc++; if (sc > bestScore) { bestScore = sc; best = s; } }
    return (best || sentences[0] || doc.content.slice(0, 300)) + '.';
  }
  function hasArabic(text) { return /[؀-ۿ]/.test(String(text || '')); }
  function answerQuestion(query) {
    const results = searchKnowledge(query, 3);
    if (!results.length || results[0].score < 1.2) {
      const english = !hasArabic(query);
      return { answer: english
        ? 'Sorry, I could not find a direct answer in the available regulations. Please rephrase your question, or submit an official request via "New Complaint" and the responsible department will reply formally.'
        : 'معلش، مش لاقي إجابة مباشرة عن السؤال ده في لوائح المعهد المتاحة عندي. تقدر تعيد صياغة السؤال، أو لو الموضوع خاص بحالتك ممكن تقدمه كشكوى من "شكوى جديدة" والقسم المختص هيرد عليك رسميًا.', sources: [], grounded: false };
    }
    const top = results[0].doc;
    return { answer: extractAnswer(top, query), sources: results.map(r => ({ title: r.doc.title, source: r.doc.source, page: r.doc.page, category: r.doc.category, score: Math.round(r.score * 10) / 10 })), grounded: true };
  }
  function weeklySeries(rows, weeks = 8) {
    const map = new Map();
    for (const r of rows) {
      const d = parseUtc(r.created_at);
      if (isNaN(d)) continue;
      const day = d.getUTCDay();
      const thursday = new Date(d); thursday.setUTCDate(d.getUTCDate() + 4 - (day || 7));
      const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
      const weekNo = Math.ceil(((thursday - yearStart) / 86400000 + 1) / 7);
      const key = `${thursday.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
      map.set(key, (map.get(key) || 0) + 1);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-weeks).map(([week, count]) => ({ week, count }));
  }
  function linearPredict(values) {
    const n = values.length;
    if (n < 2) return values[0] || 0;
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    for (let i = 0; i < n; i++) { sumX += i; sumY += values[i]; sumXY += i * values[i]; sumXX += i * i; }
    const slope = (n * sumXY - sumX * sumY) / Math.max(1e-9, n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    return Math.max(0, Math.round(intercept + slope * n));
  }
  function buildInsights() {
    const all = DB.complaints.map(c => ({ ...c, department_name: (DB.departments.find(d => d.id === c.department_id) || {}).name, type_name: c.type_id ? (DB.complaint_types.find(t => t.id === c.type_id) || {}).name : null }));
    const total = all.length;
    const newCount = all.filter(c => c.status === 'new').length;
    const inProgress = all.filter(c => c.status === 'in_progress').length;
    const open = newCount + inProgress;
    const resolved = all.filter(c => c.status === 'resolved').length;
    const rejected = all.filter(c => c.status === 'rejected').length;
    const resolvedTimes = all.filter(c => c.status === 'resolved' && c.resolved_at).map(c => (parseUtc(c.resolved_at) - parseUtc(c.created_at)) / 3600000);
    const avgResolutionHours = resolvedTimes.length ? Math.round(resolvedTimes.reduce((a, b) => a + b, 0) / resolvedTimes.length) : 0;
    const ratings = all.filter(c => c.rating).map(c => c.rating);
    const satisfaction = ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 20) : null;
    const deptMap = {};
    for (const c of all) {
      const k = c.department_name;
      deptMap[k] = deptMap[k] || { name: k, total: 0, open: 0, resolved: 0 };
      deptMap[k].total++;
      if (c.status === 'new' || c.status === 'in_progress') deptMap[k].open++;
      if (c.status === 'resolved') deptMap[k].resolved++;
    }
    const perDepartment = Object.values(deptMap).sort((a, b) => b.total - a.total);
    const typeMap = {};
    for (const c of all) { const k = c.type_name || c.ai_category || 'أخرى'; typeMap[k] = (typeMap[k] || 0) + 1; }
    const topTypes = Object.entries(typeMap).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count]) => ({ name, count }));
    const staffMap = {};
    for (const c of all.filter(c => c.status === 'resolved' && c.assigned_to)) { const u = findUser(c.assigned_to); if (u && u.role === 'staff') staffMap[u.name] = (staffMap[u.name] || 0) + 1; }
    const staffPerf = Object.entries(staffMap).map(([name, resolved_count]) => ({ name, resolved_count })).sort((a, b) => b.resolved_count - a.resolved_count);
    const series = weeklySeries(all, 8);
    const prediction = linearPredict(series.map(s => s.count));
    const currentWeek = series.length ? series[series.length - 1].count : 0;
    const urgentOpen = all.filter(c => (c.status === 'new' || c.status === 'in_progress') && (c.priority === 'urgent' || c.priority === 'high')).length;
    return { total, newCount, inProgress, open, resolved, rejected, avgResolutionHours, satisfaction, perDepartment, topTypes, staffPerf, series, prediction, currentWeek, urgentOpen };
  }
  function generateSummary() {
    const i = buildInsights();
    const today = new Date().toISOString().slice(0, 10);
    const topDept = i.perDepartment[0], topType = i.topTypes[0];
    const lines = [
      `تقرير تحليل الشكاوى — حتى ${today}`, '',
      `إجمالي الشكاوى والطلبات المسجلة ${i.total}، منها ${i.open} مفتوحة و ${i.resolved} تم حلها (${i.rejected} مرفوضة).`,
      `متوسط زمن الحل ${i.avgResolutionHours} ساعة${i.satisfaction !== null ? `، ومستوى رضا الطلاب ${i.satisfaction}%` : ''}.`,
    ];
    if (topDept) lines.push(`أكثر الأقسام استقبالًا للشكاوى: "${topDept.name}" بإجمالي ${topDept.total} شكوى (${topDept.open} منها ما زالت مفتوحة).`);
    if (topType) lines.push(`أكثر المشكلات تكرارًا: "${topType.name}" بعدد ${topType.count} شكوى.`);
    if (i.series.length >= 2) {
      const last = i.series[i.series.length - 1].count, prev = i.series[i.series.length - 2].count;
      const diff = last - prev;
      lines.push(`الحجم الأسبوعي ${diff >= 0 ? 'ارتفع' : 'انخفض'} بمقدار ${Math.abs(diff)} شكوى عن الأسبوع السابق، والتوقع للأسبوع القادم ${i.prediction} شكوى تقريبًا.`);
    }
    if (i.urgentOpen > 0) lines.push(`تنبيه: يوجد ${i.urgentOpen} شكوى عاجلة أو عالية الأولوية مفتوحة تحتاج تدخلًا سريعًا.`);
    lines.push('', 'توصيات مقترحة:');
    if (topDept && topDept.open > 3) lines.push(`- دعم قسم "${topDept.name}" بموظف إضافي أو إعادة توزيع الشكاوى لتقليل التراكم المفتوح.`);
    if (topType) lines.push(`- نشر إرشادات أو إعلان ثابت عن "${topType.name}" لتقليل الشكاوى المتكررة من المنبع.`);
    if (i.avgResolutionHours > 72) lines.push('- مراجعة زمن الاستجابة المستهدف (SLA) وتفعيل تنبيهات تلقائية للشكاوى المتأخرة.');
    lines.push('- تحديث قاعدة المعرفة (اللوائح) باستمرار لرفع جودة إجابات المساعد الذكي.');
    return { summary: lines.join('\n'), insights: i, generatedAt: today };
  }

  const PRIORITY_VALUES = ['low', 'medium', 'high', 'urgent', 'critical'];

  // فحص "اقتراب موعد انتهاء مدة الحل" — يُستدعى مع تحميل الإشعارات
  function slaReminderScan() {
    const now = Date.now();
    const open = DB.complaints.filter(c => c.status === 'new' || c.status === 'in_progress');
    for (const c of open) {
      const dept = DB.departments.find(d => d.id === c.department_id);
      if (!dept) continue;
      const created = parseUtc(c.created_at).getTime();
      if (isNaN(created)) continue;
      const hoursLeft = (created + dept.sla_hours * 3600000 - now) / 3600000;
      if (hoursLeft < 12) {
        const already = DB.notifications.find(n => n.ref_id === c.id && n.ref_type === 'complaint' && n.title.startsWith('اقتراب موعد'));
        if (already) continue;
        notify(c.student_id, 'اقتراب موعد انتهاء مدة الحل ⏳', `${c.ticket_no} — تبقى أقل من 12 ساعة على موعد الـ SLA`, 'complaint', c.id);
        const targets = c.assigned_to ? [c.assigned_to] : DB.users.filter(x => x.role === 'staff' && x.department_id === c.department_id && x.active).map(x => x.id);
        for (const t of targets) notify(t, 'اقتراب موعد انتهاء الـ SLA ⏳', `${c.ticket_no} — سارع بالرد على الطالب`, 'complaint', c.id);
      }
    }
    saveDb(DB);
  }

  // ---------- اسأل الإدارة ----------
  const ADMIN_SUGGESTIONS = [
    'ما أكثر مشكلة تواجه الطلاب هذا الشهر؟',
    'ما القسم الذي يستقبل أكبر عدد من الشكاوى؟',
    'ما متوسط وقت حل الشكاوى؟',
    'ما نسبة الشكاوى التي تم حلها؟',
  ];
  function deptStatsForAsk() {
    const rows = DB.complaints.map(c => ({ ...c, department_name: (DB.departments.find(d => d.id === c.department_id) || {}).name }));
    const deptMap = {};
    for (const c of rows) {
      const k = c.department_name;
      deptMap[k] = deptMap[k] || { name: k, total: 0, open: 0, resolved: 0 };
      deptMap[k].total++;
      if (c.status === 'new' || c.status === 'in_progress') deptMap[k].open++;
      if (c.status === 'resolved') deptMap[k].resolved++;
    }
    return Object.values(deptMap).sort((a, b) => b.total - a.total);
  }
  function weekCountsForAsk() {
    const map = new Map();
    for (const c of DB.complaints) {
      const d = parseUtc(c.created_at);
      if (isNaN(d)) continue;
      const day = d.getUTCDay();
      const thursday = new Date(d); thursday.setUTCDate(d.getUTCDate() + 4 - (day || 7));
      const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
      const weekNo = Math.ceil(((thursday - yearStart) / 86400000 + 1) / 7);
      const key = `${thursday.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
      map.set(key, (map.get(key) || 0) + 1);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-8).map(([week, count]) => ({ week, count }));
  }
  function adminAsk(question) {
    const nq = normalizeArabic(question);
    const has = (...words) => words.some(w => nq.includes(normalizeArabic(w)));
    const ins = buildInsights();
    const perDepartment = deptStatsForAsk();
    const series = weekCountsForAsk();

    if (has('توقع', 'القادم', 'الاسبوع الجاي')) {
      return {
        answer: `🔮 توقع (ليس رقمًا فعليًا): بناءً على انحدار خطي على آخر ${series.length} أسابيع من البيانات الفعلية، أتوقع ${ins.prediction} شكوى في الأسبوع القادم. هذا الأسبوع وصل ${ins.currentWeek} شكوى فعلية.`,
        stats: [{ label: 'توقع الأسبوع القادم', value: String(ins.prediction) }, { label: 'شكاوى هذا الأسبوع', value: String(ins.currentWeek) }],
        chart: { type: 'line', title: 'الحجم الأسبوعي للشكاوى', labels: series.map(s => s.week), values: series.map(s => s.count) },
        suggestions: ADMIN_SUGGESTIONS,
      };
    }
    if (has('اكثر مشكل', 'أكثر مشكل', 'مشاكل متكرر', 'مشكلات متكرر')) {
      const top = ins.topTypes.slice(0, 3);
      if (!top.length) return { answer: 'لا توجد شكاوى كافية لتحديد أكثر المشكلات تكرارًا بعد.', stats: [], chart: null, suggestions: ADMIN_SUGGESTIONS };
      return {
        answer: `أكثر المشكلات تكرارًا:\n${top.map((t, i) => `${i + 1}. ${t.name} — ${t.count} شكوى`).join('\n')}`,
        stats: top.map(t => ({ label: t.name, value: `${t.count}` })),
        chart: { type: 'bar', title: 'أكثر الأنواع تكرارًا', labels: top.map(t => t.name), values: top.map(t => t.count) },
        suggestions: ADMIN_SUGGESTIONS,
      };
    }
    if (has('اكثر قسم', 'أكثر قسم', 'اكبر عدد', 'أكبر عدد', 'يستقبل', 'استقبال')) {
      if (!perDepartment.length) return { answer: 'لا توجد شكاوى مسجلة بعد.', stats: [], chart: null, suggestions: ADMIN_SUGGESTIONS };
      const top = perDepartment[0];
      return {
        answer: `القسم الأعلى استقبالًا للشكاوى هو «${top.name}» بإجمالي ${top.total} شكوى (${top.open} مفتوحة حاليًا و${top.resolved} تم حلها).`,
        stats: [{ label: 'إجمالي الشكاوى', value: String(top.total) }, { label: 'مفتوحة', value: String(top.open) }, { label: 'تم حلها', value: String(top.resolved) }],
        chart: { type: 'bar', title: 'الشكاوى حسب القسم', labels: perDepartment.map(d => d.name), values: perDepartment.map(d => d.total) },
        suggestions: ADMIN_SUGGESTIONS,
      };
    }
    if (has('متوسط') && has('وقت', 'زمن')) {
      const cmp = ins.avgResolutionHours <= 48 ? 'ضمن مستهدف الـ SLA (48 ساعة)' : 'أعلى من مستهدف الـ SLA (48 ساعة) — يحتاج تدخل';
      return {
        answer: `متوسط زمن حل الشكاوى في المعهد ${ins.avgResolutionHours} ساعة — وهذا ${cmp}.`,
        stats: [{ label: 'متوسط زمن الحل', value: `${ins.avgResolutionHours} ساعة` }, { label: 'مستهدف الـ SLA', value: '48 ساعة' }],
        chart: null,
        suggestions: ADMIN_SUGGESTIONS,
      };
    }
    if (has('نسبة') && has('حل')) {
      const pct = ins.total ? Math.round((ins.resolved / ins.total) * 100) : 0;
      return {
        answer: `تم حل ${ins.resolved} من أصل ${ins.total} شكوى — أي بنسبة ${pct}% (المرفوضة: ${ins.rejected}).`,
        stats: [{ label: 'تم حلها', value: String(ins.resolved) }, { label: 'مفتوحة', value: String(ins.open) }, { label: 'نسبة الحل', value: `${pct}%` }],
        chart: { type: 'bar', title: 'توزيع حالات الشكاوى', labels: ['جديدة', 'قيد المراجعة', 'تم الحل', 'مرفوضة'], values: [ins.newCount, ins.inProgress, ins.resolved, ins.rejected] },
        suggestions: ADMIN_SUGGESTIONS,
      };
    }
    if (has('قسم', 'اقسام', 'قسمه') && has('تأخر', 'تأخير', 'اعلى تاخير', 'الأعلى تأخير', 'اعلى تأخير')) {
      const deptHours = {};
      for (const c of DB.complaints.filter(c => c.status === 'resolved' && c.resolved_at)) {
        const name = (DB.departments.find(d => d.id === c.department_id) || {}).name || 'غير محدد';
        const hrs = (parseUtc(c.resolved_at) - parseUtc(c.created_at)) / 3600000;
        const r = deptHours[name] = deptHours[name] || { name, sum: 0, count: 0 };
        r.sum += hrs; r.count++;
      }
      const byDept = Object.values(deptHours).map(d => ({ name: d.name, avg_hours: d.sum / d.count, resolved_count: d.count })).sort((a, b) => b.avg_hours - a.avg_hours);
      const breached = DB.complaints.filter(c => (c.status === 'new' || c.status === 'in_progress') && (Date.now() - parseUtc(c.created_at)) / 3600000 > ((DB.departments.find(d => d.id === c.department_id) || {}).sla_hours || 48)).length;
      if (!byDept.length) return { answer: 'لا توجد شكاوى محلولة كافية لحساب متوسط الزمن لكل قسم.', stats: [], chart: null, suggestions: ADMIN_SUGGESTIONS };
      const worst = byDept[0], best = byDept[byDept.length - 1];
      return {
        answer: `زمن الحل حسب القسم (فعلي، من الشكاوى المحلولة):\n- الأبطأ: «${worst.name}» بمتوسط ${Math.round(worst.avg_hours)} ساعة (${worst.resolved_count} شكاوى محلولة)\n- الأسرع: «${best.name}» بمتوسط ${Math.round(best.avg_hours)} ساعة\n- شكاوى مفتوحة متأخرة عن الـ SLA حاليًا: ${breached}`,
        stats: byDept.map(d => ({ label: d.name, value: `${Math.round(d.avg_hours)} ساعة` })),
        chart: { type: 'bar', title: 'متوسط زمن الحل لكل قسم (ساعة)', labels: byDept.map(d => d.name), values: byDept.map(d => Math.round(d.avg_hours)) },
        suggestions: ADMIN_SUGGESTIONS,
      };
    }
    if (has('متكرر', 'تكرار', 'متكررة', 'تتكرر')) {
      const repeated = ins.topTypes.filter(t => t.count >= 4);
      if (!repeated.length) {
        return {
          answer: `لا توجد مشكلة متكررة بشكل لافت (تحتاج 4+ شكاوى لنفس النوع). الأكثر ورودًا حاليًا: ${ins.topTypes[0]?.name || '—'} (${ins.topTypes[0]?.count || 0} شكوى).`,
          stats: ins.topTypes.slice(0, 3).map(t => ({ label: t.name, value: `${t.count}` })),
          chart: null,
          suggestions: ADMIN_SUGGESTIONS,
        };
      }
      return {
        answer: `المشكلات المتكررة (4+ شكاوى لنفس النوع):\n${repeated.map((t, i) => `${i + 1}. ${t.name} — ${t.count} شكوى`).join('\n')}\n\nالتوصية: نشر إرشادات للطلاب عن هذه المشكلات يقلل الحجم من المنبع.`,
        stats: repeated.map(t => ({ label: t.name, value: `${t.count}` })),
        chart: { type: 'bar', title: 'المشكلات المتكررة', labels: repeated.map(t => t.name), values: repeated.map(t => t.count) },
        suggestions: ADMIN_SUGGESTIONS,
      };
    }
    if (has('رضا', 'تقييم', 'اراء')) {
      const deptRate = {};
      for (const c of DB.complaints.filter(c => c.rating)) {
        const k = (DB.departments.find(d => d.id === c.department_id) || {}).name || 'غير محدد';
        const r = deptRate[k] = deptRate[k] || { name: k, sum: 0, count: 0 };
        r.sum += c.rating; r.count++;
      }
      const byDept = Object.values(deptRate).map(d => ({ name: d.name, avg: d.sum / d.count, count: d.count })).sort((a, b) => b.avg - a.avg);
      const best = byDept[0], worst = byDept[byDept.length - 1];
      const totalRatings = byDept.reduce((s, d) => s + d.count, 0);
      return {
        answer: `متوسط رضا الطلاب ${ins.satisfaction !== null ? ins.satisfaction + '%' : 'غير متاح'} من ${totalRatings} تقييم.${best ? `\nأعلى قسم: «${best.name}»` : ''}${worst && worst !== best ? `\nأقل قسم: «${worst.name}» — يحتاج تحسين` : ''}`,
        stats: byDept.map(d => ({ label: d.name, value: `${Math.round(d.avg * 20)}%` })).slice(0, 4),
        chart: byDept.length ? { type: 'bar', title: 'نسبة الرضا حسب القسم', labels: byDept.map(d => d.name), values: byDept.map(d => Math.round(d.avg * 20)) } : null,
        suggestions: ADMIN_SUGGESTIONS,
      };
    }
    if (has('متاخر', 'متأخر', 'تأخير', 'اتأخرت')) {
      const rows = DB.complaints.filter(c => c.status === 'new' || c.status === 'in_progress').sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))).slice(0, 5);
      if (!rows.length) return { answer: 'مفيش شكاوى مفتوحة متأخرة دلوقتي — كل شيء تحت السيطرة ✓', stats: [], chart: null, suggestions: ADMIN_SUGGESTIONS };
      return {
        answer: `أقدم ${rows.length} شكاوى مفتوحة تحتاج انتباه:\n${rows.map(r => `- ${r.ticket_no}: ${r.title.slice(0, 60)}`).join('\n')}`,
        stats: rows.map(r => ({ label: r.ticket_no, value: 'مفتوحة' })),
        chart: null,
        suggestions: ADMIN_SUGGESTIONS,
      };
    }
    if (has('مقارنة', 'الشهر الماضي', 'الشهر السابق')) {
      const now = Date.now();
      const thisMonth = DB.complaints.filter(c => now - parseUtc(c.created_at) < 30 * 86400000).length;
      const prevMonth = DB.complaints.filter(c => { const t = now - parseUtc(c.created_at); return t >= 30 * 86400000 && t < 60 * 86400000; }).length;
      const diff = thisMonth - prevMonth;
      const trend = diff > 0 ? `زادت بمقدار ${diff} شكوى عن الشهر السابق` : diff < 0 ? `انخفضت بمقدار ${Math.abs(diff)} شكوى عن الشهر السابق` : 'ثابتة مقارنة بالشهر السابق';
      return {
        answer: `خلال آخر 30 يوم: ${thisMonth} شكوى، مقابل ${prevMonth} في الـ 30 يوم التي قبلها — ${trend}.`,
        stats: [{ label: 'آخر 30 يوم', value: String(thisMonth) }, { label: 'الـ 30 يوم السابقة', value: String(prevMonth) }, { label: 'الفرق', value: (diff >= 0 ? '+' : '') + diff }],
        chart: { type: 'bar', title: 'مقارنة شهرية', labels: ['الشهر الماضي', 'آخر 30 يوم'], values: [prevMonth, thisMonth] },
        suggestions: ADMIN_SUGGESTIONS,
      };
    }
    if (has('عاجل', 'حرج', 'critical', 'عاجله', 'حرجة')) {
      const criticalOpen = DB.complaints.filter(c => c.priority === 'critical' && (c.status === 'new' || c.status === 'in_progress')).length;
      return {
        answer: `حاليًا يوجد ${ins.urgentOpen} شكوى عاجلة/عالية الأولوية مفتوحة، منها ${criticalOpen} بمستوى «حرج». راجع «الشكاوى العاجلة» في لوحة الموظفين.`,
        stats: [{ label: 'عاجلة/مرتفعة مفتوحة', value: String(ins.urgentOpen) }, { label: 'حرجة مفتوحة', value: String(criticalOpen) }],
        chart: null,
        suggestions: ADMIN_SUGGESTIONS,
      };
    }
    const pct = ins.total ? Math.round((ins.resolved / ins.total) * 100) : 0;
    return {
      answer: `نظرة عامة على المعهد:\nإجمالي الشكاوى ${ins.total} (${ins.open} مفتوحة، ${ins.resolved} تم حلها = ${pct}%، ${ins.rejected} مرفوضة).\nمتوسط زمن الحل ${ins.avgResolutionHours} ساعة${ins.satisfaction !== null ? `، رضا الطلاب ${ins.satisfaction}%` : ''}.\nجرّب سؤالًا محددًا مثل: «ما أكثر قسم استقبالًا؟»`,
      stats: [{ label: 'إجمالي الشكاوى', value: String(ins.total) }, { label: 'مفتوحة', value: String(ins.open) }, { label: 'نسبة الحل', value: `${pct}%` }],
      chart: null,
      suggestions: ADMIN_SUGGESTIONS,
    };
  }

  // ---------- الراوتر ----------
  async function route(method, path, query, body) {
    // ===== Auth =====
    if (path === '/api/auth/register' && method === 'POST') {
      const { name, email, password, phone, student_code } = body;
      if (!name || !email || !password) return fail(400, 'الاسم والبريد وكلمة المرور مطلوبة');
      if (String(password).length < 6) return fail(400, 'كلمة المرور 6 أحرف على الأقل');
      const em = String(email).toLowerCase().trim();
      if (DB.users.some(u => u.email === em)) return fail(409, 'البريد مستخدم بالفعل');
      const u = { id: nextId(DB.users), name: String(name).trim(), email: em, password: String(password), role: 'student', department_id: null, student_code: student_code || null, phone: phone || null, active: 1, last_login: null, created_at: nowUtc() };
      DB.users.push(u); saveDb(DB);
      localStorage.setItem(SESSION, String(u.id));
      return ok({ user: publicUser(u) }, 201);
    }
    if (path === '/api/auth/login' && method === 'POST') {
      const em = String(body.email || '').toLowerCase().trim();
      const u = DB.users.find(x => x.email === em);
      if (!u || u.password !== String(body.password || '')) return fail(401, 'البريد أو كلمة المرور غير صحيحة');
      if (!u.active) return fail(403, 'الحساب موقوف. تواصل مع الإدارة.');
      u.last_login = nowUtc(); saveDb(DB);
      localStorage.setItem(SESSION, String(u.id));
      return ok({ user: publicUser(u) });
    }
    if (path === '/api/auth/logout' && method === 'POST') { localStorage.removeItem(SESSION); return ok(null); }
    if (path === '/api/auth/me' && method === 'GET') {
      const u = sessionUser();
      return u ? ok({ user: publicUser(u) }) : fail(401, 'سجل الدخول أولًا');
    }

    // ===== Lookups =====
    if (path === '/api/departments' && method === 'GET') {
      const u = sessionUser(); if (!u) return fail(401, 'سجل الدخول أولًا');
      return ok(DB.departments.map(d => ({ ...d, complaints_count: DB.complaints.filter(c => c.department_id === d.id).length })));
    }
    if (path === '/api/complaint-types' && method === 'GET') {
      const u = sessionUser(); if (!u) return fail(401, 'سجل الدخول أولًا');
      return ok(DB.complaint_types.map(t => ({ ...t, department_name: (DB.departments.find(d => d.id === t.department_id) || {}).name })));
    }

    // ===== Upload (data URL — لا ملفات على سيرفر في الديمو) =====
    if (path === '/api/upload' && method === 'POST') {
      const u = sessionUser(); if (!u) return fail(401, 'سجل الدخول أولًا');
      if (!body.filename || !body.dataBase64) return fail(400, 'الملف غير مكتمل');
      return ok({ url: body.dataBase64, name: body.filename });
    }

    // ===== Complaints =====
    if (path === '/api/complaints' && method === 'POST') {
      const u = sessionUser(); if (!u) return fail(401, 'سجل الدخول أولًا');
      if (u.role !== 'student') return fail(403, 'ليس لديك صلاحية لهذا الإجراء');
      const { title, details, type_id, department_id, priority, attachment } = body;
      if (!title || !details || String(title).trim().length < 5 || String(details).trim().length < 10) return fail(400, 'اكتب عنوان (5 أحرف+) وتفاصيل (10 أحرف+) للشكوى');
      const cls = classifyComplaint(`${title} ${details}`);
      let deptId = Number(department_id) || cls.department_id;
      if (!DB.departments.some(d => d.id === deptId)) deptId = cls.department_id;
      let typeId = Number(type_id) || null;
      if (typeId && !DB.complaint_types.some(t => t.id === typeId)) typeId = null;
      const finalPriority = ['low', 'medium', 'high', 'urgent'].includes(priority) ? priority : cls.priority;
      const ticketNo = `NX-${new Date().getFullYear()}-${String(DB.meta.nextComplaint++).padStart(4, '0')}`;
      const c = { id: nextId(DB.complaints), ticket_no: ticketNo, student_id: u.id, type_id: typeId, department_id: deptId, assigned_to: null, title: String(title).trim(), details: String(details).trim(), attachment: attachment || null, status: 'new', priority: finalPriority, ai_category: cls.category, ai_confidence: cls.confidence, rating: null, created_at: nowUtc(), updated_at: nowUtc(), resolved_at: null };
      DB.complaints.push(c);
      logUpdate(c.id, u.id, 'created', 'تم إنشاء الشكوى وتصنيفها تلقائيًا بواسطة NEXUS AI');
      for (const st of DB.users.filter(x => x.role === 'staff' && x.department_id === deptId && x.active)) notify(st.id, 'شكوى جديدة وصلت لقسمه', `${ticketNo} — ${c.title}`, 'complaint', c.id);
      saveDb(DB);
      return ok({ complaint: loadComplaint(c.id), ai: cls }, 201);
    }
    if (path === '/api/complaints' && method === 'GET') {
      const u = sessionUser(); if (!u) return fail(401, 'سجل الدخول أولًا');
      let rows = DB.complaints.map(c => {
        const t = DB.complaint_types.find(x => x.id === c.type_id);
        const d = DB.departments.find(x => x.id === c.department_id);
        const s = findUser(c.student_id);
        const a = c.assigned_to ? findUser(c.assigned_to) : null;
        return { ...c, type_name: t ? t.name : null, department_name: d ? d.name : null, student_name: s ? s.name : null, student_code: s ? s.student_code : null, assigned_name: a ? a.name : null };
      });
      if (u.role === 'student') rows = rows.filter(c => c.student_id === u.id);
      else if (u.role === 'staff') rows = rows.filter(c => c.department_id === u.department_id || c.assigned_to === u.id);
      const p = query;
      if (p.status) rows = rows.filter(c => c.status === p.status);
      if (p.priority) rows = rows.filter(c => c.priority === p.priority);
      if (p.department && u.role === 'admin') rows = rows.filter(c => c.department_id === Number(p.department));
      if (p.q) { const q = String(p.q).toLowerCase(); rows = rows.filter(c => [c.title, c.details, c.ticket_no, c.student_name].some(v => String(v || '').toLowerCase().includes(q))); }
      if (p.from) rows = rows.filter(c => c.created_at >= `${p.from} 00:00:00`);
      if (p.to) rows = rows.filter(c => c.created_at <= `${p.to} 23:59:59`);
      const PR = { critical: 0, urgent: 1, high: 2, medium: 3, low: 4 };
      rows.sort((a, b) => (PR[a.priority] - PR[b.priority]) || String(b.created_at).localeCompare(String(a.created_at)));
      return ok(rows.slice(0, 500));
    }
    const mGet = path.match(/^\/api\/complaints\/(\d+)$/);
    if (mGet && method === 'GET') {
      const u = sessionUser(); if (!u) return fail(401, 'سجل الدخول أولًا');
      const c = loadComplaint(Number(mGet[1]));
      if (!c) return fail(404, 'الشكوى غير موجودة');
      if (!canSeeComplaint(u, c)) return fail(403, 'لا تملك صلاحية مشاهدة هذه الشكوى');
      const internalAllowed = u.role !== 'student';
      const messages = DB.messages.filter(m => m.complaint_id === c.id && (internalAllowed || !m.is_internal)).map(m => ({ ...m, sender_name: findUser(m.sender_id)?.name, sender_role: findUser(m.sender_id)?.role })).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
      const updates = DB.complaint_updates.filter(x => x.complaint_id === c.id).map(x => ({ ...x, user_name: x.user_id ? findUser(x.user_id)?.name : null, user_role: x.user_id ? findUser(x.user_id)?.role : null })).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
      return ok({ complaint: c, messages, updates });
    }
    const mStatus = path.match(/^\/api\/complaints\/(\d+)\/status$/);
    if (mStatus && method === 'POST') {
      const u = sessionUser(); if (!u) return fail(401, 'سجل الدخول أولًا');
      if (u.role === 'student') return fail(403, 'ليس لديك صلاحية لهذا الإجراء');
      const c = DB.complaints.find(x => x.id === Number(mStatus[1]));
      if (!c) return fail(404, 'الشكوى غير موجودة');
      if (!canSeeComplaint(u, c)) return fail(403, 'ليست ضمن نطاقك');
      if (!['new', 'in_progress', 'resolved', 'rejected'].includes(body.status)) return fail(400, 'حالة غير صالحة');
      c.status = body.status; c.updated_at = nowUtc();
      c.resolved_at = body.status === 'resolved' ? nowUtc() : null;
      c.closure_status = body.status === 'resolved' ? 'awaiting' : null;
      logUpdate(c.id, u.id, 'status', `تم تغيير الحالة إلى: ${STATUS_LABEL[c.status]}${c.status === 'resolved' ? ' — بانتظار تأكيد الطالب' : ''}`);
      notify(c.student_id, c.status === 'resolved' ? 'الموظف لخّص مشكلتك — هل اتحلت؟ 🎉' : 'تحديث على شكواك', `${c.ticket_no} — ${c.status === 'resolved' ? 'بانتظار تأكيدك وتقييمك من داخل شكواك' : 'الحالة أصبحت: ' + STATUS_LABEL[c.status]}`, 'complaint', c.id);
      saveDb(DB);
      return ok({ complaint: loadComplaint(c.id) });
    }
    const mAssign = path.match(/^\/api\/complaints\/(\d+)\/assign$/);
    if (mAssign && method === 'POST') {
      const u = sessionUser(); if (!u) return fail(401, 'سجل الدخول أولًا');
      if (u.role === 'student') return fail(403, 'ليس لديك صلاحية لهذا الإجراء');
      const c = DB.complaints.find(x => x.id === Number(mAssign[1]));
      if (!c) return fail(404, 'الشكوى غير موجودة');
      if (!canSeeComplaint(u, c)) return fail(403, 'ليست ضمن نطاقك');
      let targetId = Number(body.assigned_to);
      if (u.role === 'staff') { if (targetId && targetId !== u.id) return fail(403, 'الموظف يمكنه الإسناد لنفسه فقط'); targetId = u.id; }
      if (!targetId) targetId = u.id;
      const target = DB.users.find(x => x.id === targetId && (x.role === 'staff' || x.role === 'admin') && x.active);
      if (!target) return fail(400, 'الموظف غير موجود');
      c.assigned_to = targetId; c.updated_at = nowUtc();
      logUpdate(c.id, u.id, 'assigned', `تم إسناد الشكوى إلى ${target.name}`);
      if (targetId !== u.id) notify(targetId, 'شكوى أُسندت إليك', `${c.ticket_no} — ${c.title}`, 'complaint', c.id);
      saveDb(DB);
      return ok({ complaint: loadComplaint(c.id) });
    }
    const mTransfer = path.match(/^\/api\/complaints\/(\d+)\/transfer$/);
    if (mTransfer && method === 'POST') {
      const u = sessionUser(); if (!u) return fail(401, 'سجل الدخول أولًا');
      if (u.role === 'student') return fail(403, 'ليس لديك صلاحية لهذا الإجراء');
      const c = DB.complaints.find(x => x.id === Number(mTransfer[1]));
      if (!c) return fail(404, 'الشكوى غير موجودة');
      if (!canSeeComplaint(u, c)) return fail(403, 'ليست ضمن نطاقك');
      const newDept = Number(body.department_id);
      if (!newDept || !DB.departments.some(d => d.id === newDept)) return fail(400, 'القسم غير صحيح');
      const newAssignee = body.assigned_to ? Number(body.assigned_to) : null;
      c.department_id = newDept; c.assigned_to = newAssignee; c.updated_at = nowUtc();
      const dept = DB.departments.find(d => d.id === newDept);
      logUpdate(c.id, u.id, 'transfer', `تم التحويل إلى قسم ${dept.name}${body.reason ? ' — السبب: ' + body.reason : ''}`);
      for (const st of DB.users.filter(x => x.role === 'staff' && x.department_id === newDept && x.active)) notify(st.id, 'شكوى محوّلة إليكم', `${c.ticket_no} — ${c.title}`, 'complaint', c.id);
      notify(c.student_id, 'تم تحويل شكواك للقسم المختص', `${c.ticket_no} — أصبحت لدى قسم ${dept.name}`, 'complaint', c.id);
      saveDb(DB);
      return ok({ complaint: loadComplaint(c.id) });
    }
    const mMsg = path.match(/^\/api\/complaints\/(\d+)\/messages$/);
    if (mMsg && method === 'POST') {
      const u = sessionUser(); if (!u) return fail(401, 'سجل الدخول أولًا');
      const c = DB.complaints.find(x => x.id === Number(mMsg[1]));
      if (!c) return fail(404, 'الشكوى غير موجودة');
      if (!canSeeComplaint(u, c)) return fail(403, 'لا تملك صلاحية');
      if (!body.body || String(body.body).trim().length < 2) return fail(400, 'الرسالة قصيرة جدًا');
      const internal = !!body.is_internal;
      if (internal && u.role === 'student') return fail(403, 'الطالب لا يضيف ملاحظات داخلية');
      DB.messages.push({ id: nextId(DB.messages), complaint_id: c.id, sender_id: u.id, body: String(body.body).trim(), is_internal: internal ? 1 : 0, created_at: nowUtc() });
      c.updated_at = nowUtc();
      if (!internal) {
        if (u.role === 'student') {
          const targets = c.assigned_to ? [c.assigned_to] : DB.users.filter(x => x.role === 'staff' && x.department_id === c.department_id && x.active).map(x => x.id);
          for (const t of targets) notify(t, 'رسالة جديدة من الطالب', `${c.ticket_no} — ${String(body.body).trim().slice(0, 80)}`, 'complaint', c.id);
        } else {
          notify(c.student_id, 'رد جديد على شكواك', `${c.ticket_no} — ${String(body.body).trim().slice(0, 80)}`, 'complaint', c.id);
        }
      }
      saveDb(DB);
      return ok({ ok: true });
    }
    const mReq = path.match(/^\/api\/complaints\/(\d+)\/request-info$/);
    if (mReq && method === 'POST') {
      const u = sessionUser(); if (!u) return fail(401, 'سجل الدخول أولًا');
      if (u.role === 'student') return fail(403, 'ليس لديك صلاحية لهذا الإجراء');
      const c = DB.complaints.find(x => x.id === Number(mReq[1]));
      if (!c) return fail(404, 'الشكوى غير موجودة');
      if (!canSeeComplaint(u, c)) return fail(403, 'ليست ضمن نطاقك');
      const msg = String(body.message || 'برجاء تزويدنا بمعلومات إضافية عن الطلب').trim();
      DB.messages.push({ id: nextId(DB.messages), complaint_id: c.id, sender_id: u.id, body: `📌 طلب معلومات إضافية: ${msg}`, is_internal: 0, created_at: nowUtc() });
      logUpdate(c.id, u.id, 'request_info', msg);
      notify(c.student_id, 'الإدارة طلبت معلومات إضافية', `${c.ticket_no} — ${msg.slice(0, 100)}`, 'complaint', c.id);
      saveDb(DB);
      return ok({ ok: true });
    }
    const mRate = path.match(/^\/api\/complaints\/(\d+)\/rate$/);
    if (mRate && method === 'POST') {
      const u = sessionUser(); if (!u) return fail(401, 'سجل الدخول أولًا');
      if (u.role !== 'student') return fail(403, 'ليس لديك صلاحية لهذا الإجراء');
      const r = Number(body.rating);
      if (!(r >= 1 && r <= 5)) return fail(400, 'التقييم من 1 إلى 5');
      const c = DB.complaints.find(x => x.id === Number(mRate[1]) && x.student_id === u.id);
      if (!c) return fail(404, 'الشكوى غير موجودة');
      if (c.status !== 'resolved') return fail(400, 'لا يمكن التقييم قبل الحل');
      if (c.rating) return fail(400, 'تم تقييم هذه الشكوى من قبل — أي تصحيح يتم عبر الإدارة');
      c.rating = r;
      c.rating_comment = String(body.comment || '').trim().slice(0, 1000) || null;
      c.updated_at = nowUtc(); saveDb(DB);
      return ok({ complaint: loadComplaint(c.id) });
    }

    // ===== Notifications =====
    if (path === '/api/notifications' && method === 'GET') {
      const u = sessionUser(); if (!u) return fail(401, 'سجل الدخول أولًا');
      slaReminderScan();
      const limit = Math.min(Number(query.limit) || 30, 100);
      let rows = DB.notifications.filter(n => n.user_id === u.id);
      if (query.unread === '1') rows = rows.filter(n => !n.read);
      rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      return ok(rows.slice(0, limit));
    }
    if (path === '/api/notifications/count' && method === 'GET') {
      const u = sessionUser(); if (!u) return fail(401, 'سجل الدخول أولًا');
      return ok({ count: DB.notifications.filter(n => n.user_id === u.id && !n.read).length });
    }
    const mRead = path.match(/^\/api\/notifications\/(\d+)\/read$/);
    if (mRead && method === 'POST') {
      const u = sessionUser(); if (!u) return fail(401, 'سجل الدخول أولًا');
      const n = DB.notifications.find(x => x.id === Number(mRead[1]) && x.user_id === u.id);
      if (n) n.read = 1;
      saveDb(DB);
      return ok({ ok: true });
    }
    if (path === '/api/notifications/read-all' && method === 'POST') {
      const u = sessionUser(); if (!u) return fail(401, 'سجل الدخول أولًا');
      DB.notifications.forEach(n => { if (n.user_id === u.id) n.read = 1; });
      saveDb(DB);
      return ok({ ok: true });
    }

    // ===== AI =====
    if (path === '/api/ai/classify' && method === 'POST') {
      const u = sessionUser(); if (!u) return fail(401, 'سجل الدخول أولًا');
      if (!body.text || String(body.text).trim().length < 5) return fail(400, 'اكتب تفاصيل أكثر للتحليل');
      return ok(classifyComplaint(body.text));
    }
    if (path === '/api/ai/chat' && method === 'POST') {
      const u = sessionUser(); if (!u) return fail(401, 'سجل الدخول أولًا');
      const msg = String(body.message || '').trim();
      if (msg.length < 3) return fail(400, 'اكتب سؤالك');
      DB.ai_conversations.push({ id: nextId(DB.ai_conversations), user_id: u.id, complaint_id: body.complaint_id || null, role: 'user', message: msg, created_at: nowUtc() });
      const { answer, sources, grounded } = answerQuestion(msg);
      DB.ai_conversations.push({ id: nextId(DB.ai_conversations), user_id: u.id, complaint_id: body.complaint_id || null, role: 'assistant', message: answer, created_at: nowUtc() });
      saveDb(DB);
      return ok({ answer, sources, grounded });
    }
    if (path === '/api/ai/conversations' && method === 'GET') {
      const u = sessionUser(); if (!u) return fail(401, 'سجل الدخول أولًا');
      return ok(DB.ai_conversations.filter(c => c.user_id === u.id).slice(-40));
    }

    // ===== Stats =====
    if (path === '/api/stats' && method === 'GET') {
      const u = sessionUser(); if (!u) return fail(401, 'سجل الدخول أولًا');
      if (u.role === 'student') {
        const rows = DB.complaints.filter(c => c.student_id === u.id);
        const by = {};
        rows.forEach(c => { by[c.status] = (by[c.status] || 0) + 1; });
        const recent = rows.slice().sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 5).map(c => ({ id: c.id, ticket_no: c.ticket_no, title: c.title, status: c.status, priority: c.priority, created_at: c.created_at }));
        return ok({ total: rows.length, new: by.new || 0, in_progress: by.in_progress || 0, resolved: by.resolved || 0, rejected: by.rejected || 0, recent });
      }
      if (u.role === 'staff') {
        const scope = DB.complaints.filter(c => c.department_id === u.department_id || c.assigned_to === u.id);
        const open = scope.filter(c => c.status === 'new' || c.status === 'in_progress');
        const mine = open.filter(c => c.assigned_to === u.id).length;
        const resolvedWeek = scope.filter(c => c.status === 'resolved' && c.resolved_at && (Date.now() - parseUtc(c.resolved_at)) < 7 * 86400000).length;
        const resolvedTotal = scope.filter(c => c.status === 'resolved').length;
        const times = scope.filter(c => c.status === 'resolved' && c.resolved_at).map(c => (parseUtc(c.resolved_at) - parseUtc(c.created_at)) / 3600000);
        const avg = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0;
        const ratings = scope.filter(c => c.rating).map(c => c.rating);
        const satisfaction = ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 20) : null;
        return ok({ assigned_to_me: mine, open: open.length, resolved_week: resolvedWeek, resolved_total: resolvedTotal, avg_resolution_hours: avg, satisfaction });
      }
      return ok(buildInsights());
    }

    // ===== Admin =====
    if (path === '/api/admin/users' && method === 'GET') {
      const u = sessionUser(); if (!u || u.role !== 'admin') return fail(403, 'ليس لديك صلاحية لهذا الإجراء');
      let rows = DB.users.slice();
      if (query.role) rows = rows.filter(x => x.role === query.role);
      return ok(rows.map(publicUser));
    }
    if (path === '/api/admin/users' && method === 'POST') {
      const u = sessionUser(); if (!u || u.role !== 'admin') return fail(403, 'ليس لديك صلاحية لهذا الإجراء');
      if (!body.name || !body.email || !body.password || !body.role) return fail(400, 'الاسم والبريد وكلمة المرور والدور مطلوبة');
      if (!['student', 'staff', 'admin'].includes(body.role)) return fail(400, 'دور غير صالح');
      if (String(body.password).length < 6) return fail(400, 'كلمة المرور 6 أحرف على الأقل');
      if (body.role === 'staff' && !body.department_id) return fail(400, 'الموظف لازم يكون له قسم');
      const em = String(body.email).toLowerCase().trim();
      if (DB.users.some(x => x.email === em)) return fail(409, 'البريد مستخدم بالفعل');
      const nu = { id: nextId(DB.users), name: String(body.name).trim(), email: em, password: String(body.password), role: body.role, department_id: body.department_id ? Number(body.department_id) : null, student_code: body.student_code || null, phone: body.phone || null, active: 1, last_login: null, created_at: nowUtc() };
      DB.users.push(nu); saveDb(DB);
      return ok(publicUser(nu), 201);
    }
    const mUser = path.match(/^\/api\/admin\/users\/(\d+)$/);
    if (mUser && method === 'PUT') {
      const u = sessionUser(); if (!u || u.role !== 'admin') return fail(403, 'ليس لديك صلاحية لهذا الإجراء');
      const t = DB.users.find(x => x.id === Number(mUser[1]));
      if (!t) return fail(404, 'المستخدم غير موجود');
      if (t.id === u.id && body.active === false) return fail(400, 'لا يمكن إيقاف حسابك الحالي');
      if (t.role === 'admin' && body.role && body.role !== 'admin' && DB.users.filter(x => x.role === 'admin').length <= 1) return fail(400, 'لا يمكن إزالة آخر مدير بالنظام');
      if (body.name) t.name = String(body.name).trim();
      if (body.email) t.email = String(body.email).toLowerCase().trim();
      if ('phone' in body) t.phone = body.phone || null;
      if (body.role) t.role = body.role;
      if ('department_id' in body) t.department_id = body.department_id ? Number(body.department_id) : null;
      if ('active' in body) t.active = body.active ? 1 : 0;
      if (body.password && String(body.password).length >= 6) t.password = String(body.password);
      saveDb(DB);
      return ok(publicUser(t));
    }
    if (mUser && method === 'DELETE') {
      const u = sessionUser(); if (!u || u.role !== 'admin') return fail(403, 'ليس لديك صلاحية لهذا الإجراء');
      const t = DB.users.find(x => x.id === Number(mUser[1]));
      if (!t) return fail(404, 'المستخدم غير موجود');
      if (t.id === u.id) return fail(400, 'لا يمكن حذف حسابك الحالي');
      if (t.role === 'admin' && DB.users.filter(x => x.role === 'admin').length <= 1) return fail(400, 'لا يمكن حذف آخر مدير بالنظام');
      DB.users = DB.users.filter(x => x.id !== t.id);
      DB.notifications = DB.notifications.filter(n => n.user_id !== t.id);
      DB.complaints.forEach(c => { if (c.assigned_to === t.id) c.assigned_to = null; });
      saveDb(DB);
      return ok({ deleted: t.id });
    }
    if (path === '/api/admin/departments' && method === 'POST') {
      const u = sessionUser(); if (!u || u.role !== 'admin') return fail(403, 'ليس لديك صلاحية لهذا الإجراء');
      if (!body.name) return fail(400, 'اسم القسم مطلوب');
      const d = { id: nextId(DB.departments), name: String(body.name).trim(), description: body.description || null, sla_hours: Number(body.sla_hours) || 48 };
      DB.departments.push(d); saveDb(DB);
      return ok(d, 201);
    }
    const mDept = path.match(/^\/api\/admin\/departments\/(\d+)$/);
    if (mDept && method === 'PUT') {
      const u = sessionUser(); if (!u || u.role !== 'admin') return fail(403, 'ليس لديك صلاحية لهذا الإجراء');
      const d = DB.departments.find(x => x.id === Number(mDept[1]));
      if (!d) return fail(404, 'القسم غير موجود');
      if (body.name) d.name = String(body.name).trim();
      if ('description' in body) d.description = body.description ?? null;
      if (body.sla_hours) d.sla_hours = Number(body.sla_hours);
      saveDb(DB);
      return ok(d);
    }
    if (mDept && method === 'DELETE') {
      const u = sessionUser(); if (!u || u.role !== 'admin') return fail(403, 'ليس لديك صلاحية لهذا الإجراء');
      const id = Number(mDept[1]);
      if (DB.complaints.some(c => c.department_id === id)) return fail(400, 'لا يمكن حذف قسم عليه شكاوى — انقلها أولًا');
      DB.complaints; DB.departments = DB.departments.filter(x => x.id !== id);
      DB.complaint_types = DB.complaint_types.filter(t => t.department_id !== id);
      DB.users.forEach(x => { if (x.department_id === id) x.department_id = null; });
      saveDb(DB);
      return ok({ deleted: id });
    }
    if (path === '/api/admin/complaint-types' && method === 'POST') {
      const u = sessionUser(); if (!u || u.role !== 'admin') return fail(403, 'ليس لديك صلاحية لهذا الإجراء');
      if (!body.name || !body.department_id) return fail(400, 'الاسم والقسم مطلوبان');
      const t = { id: nextId(DB.complaint_types), name: String(body.name).trim(), department_id: Number(body.department_id), keywords: body.keywords || '' };
      DB.complaint_types.push(t); saveDb(DB);
      return ok(t, 201);
    }
    const mType = path.match(/^\/api\/admin\/complaint-types\/(\d+)$/);
    if (mType && method === 'DELETE') {
      const u = sessionUser(); if (!u || u.role !== 'admin') return fail(403, 'ليس لديك صلاحية لهذا الإجراء');
      const id = Number(mType[1]);
      DB.complaints.forEach(c => { if (c.type_id === id) c.type_id = null; });
      DB.complaint_types = DB.complaint_types.filter(t => t.id !== id);
      saveDb(DB);
      return ok({ deleted: id });
    }
    if (path === '/api/admin/insights' && method === 'GET') {
      const u = sessionUser(); if (!u || u.role !== 'admin') return fail(403, 'ليس لديك صلاحية لهذا الإجراء');
      return ok(buildInsights());
    }
    if (path === '/api/admin/summary' && method === 'POST') {
      const u = sessionUser(); if (!u || u.role !== 'admin') return fail(403, 'ليس لديك صلاحية لهذا الإجراء');
      const { summary, insights, generatedAt } = generateSummary();
      const rep = { id: nextId(DB.reports), admin_id: u.id, title: `ملخص ذكي — ${generatedAt}`, summary, period: generatedAt, created_at: nowUtc() };
      DB.reports.push(rep); saveDb(DB);
      return ok({ id: rep.id, summary, insights, generatedAt });
    }
    if (path === '/api/admin/reports' && method === 'GET') {
      const u = sessionUser(); if (!u || u.role !== 'admin') return fail(403, 'ليس لديك صلاحية لهذا الإجراء');
      return ok(DB.reports.map(r => ({ ...r, admin_name: findUser(r.admin_id)?.name })).reverse());
    }
    if (path === '/api/admin/reports.csv' && method === 'GET') {
      const u = sessionUser(); if (!u || u.role !== 'admin') return fail(403, 'ليس لديك صلاحية لهذا الإجراء');
      let rows = DB.complaints.slice();
      if (query.from) rows = rows.filter(c => c.created_at >= `${query.from} 00:00:00`);
      if (query.to) rows = rows.filter(c => c.created_at <= `${query.to} 23:59:59`);
      rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const head = ['رقم الشكوى', 'اسم الطالب', 'القسم', 'نوع الشكوى', 'العنوان', 'الأولوية', 'الحالة', 'تاريخ الإنشاء', 'تاريخ الحل'];
      const lines = [head.map(esc).join(',')];
      for (const c of rows) {
        const st = findUser(c.student_id), d = DB.departments.find(x => x.id === c.department_id), t = DB.complaint_types.find(x => x.id === c.type_id);
        lines.push([c.ticket_no, st?.name, d?.name, t?.name, c.title, c.priority, STATUS_LABEL[c.status] || c.status, c.created_at, c.resolved_at || ''].map(esc).join(','));
      }
      return ok({ csv: '﻿' + lines.join('\r\n'), filename: 'nexus-ai-report.csv' });
    }

    // ===== الخدمات الأكاديمية =====
    if (path === '/api/academic/timetable' && method === 'GET') {
      const u = sessionUser(); if (!u) return fail(401, 'سجل الدخول أولًا');
      const DAY_ORDER = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس'];
      return ok(DB.timetable.slice().sort((a, b) => DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day) || a.start_time.localeCompare(b.start_time)));
    }
    if (path === '/api/academic/exams' && method === 'GET') {
      const u = sessionUser(); if (!u) return fail(401, 'سجل الدخول أولًا');
      const now = Date.now();
      return ok(DB.exams.slice().sort((a, b) => String(a.exam_date).localeCompare(String(b.exam_date))).map(e => ({ ...e, seconds_until: Math.max(0, Math.floor((parseUtc(e.exam_date) - now) / 1000)) })));
    }
    if (path === '/api/academic/grades' && method === 'GET') {
      const u = sessionUser(); if (!u) return fail(401, 'سجل الدخول أولًا');
      if (u.role !== 'student') return fail(403, 'ليس لديك صلاحية لهذا الإجراء');
      const rows = DB.grades.filter(g => g.student_id === u.id);
      const totalHours = rows.reduce((a, r) => a + r.credit_hours, 0);
      const weighted = rows.reduce((a, r) => a + r.score * r.credit_hours, 0);
      const mean = totalHours ? weighted / totalHours : 0;
      const gpa = rows.length ? Math.round((mean / 100 * 4) * 100) / 100 : 0;
      const gradeOf = s => s >= 85 ? 'ممتاز' : s >= 75 ? 'جيد جدًا' : s >= 65 ? 'جيد' : s >= 50 ? 'مقبول' : 'راسب';
      return ok({ grades: rows.map(r => ({ ...r, grade: gradeOf(r.score) })).sort((a, b) => b.score - a.score), mean: Math.round(mean * 10) / 10, gpa, totalCredits: totalHours, count: rows.length });
    }
    if (path === '/api/academic/fees' && method === 'GET') {
      const u = sessionUser(); if (!u) return fail(401, 'سجل الدخول أولًا');
      if (u.role !== 'student') return fail(403, 'ليس لديك صلاحية لهذا الإجراء');
      const rows = DB.fees.filter(f => f.student_id === u.id).sort((a, b) => a.due_date.localeCompare(b.due_date));
      const total = rows.reduce((a, r) => a + r.amount, 0), paid = rows.reduce((a, r) => a + r.paid, 0);
      return ok({ fees: rows, total, paid, remaining: total - paid, percentPaid: total ? Math.round(paid / total * 100) : 0 });
    }
    if (path === '/api/academic/attendance' && method === 'GET') {
      const u = sessionUser(); if (!u) return fail(401, 'سجل الدخول أولًا');
      if (u.role !== 'student') return fail(403, 'ليس لديك صلاحية لهذا الإجراء');
      const courses = DB.attendance_stats.filter(a => a.student_id === u.id);
      const totalA = courses.reduce((a, r) => a + r.attended, 0), totalT = courses.reduce((a, r) => a + r.total, 0);
      return ok({ courses: courses.map(c => ({ ...c, pct: c.total ? Math.round(c.attended / c.total * 100) : 0, absences: c.total - c.attended })), overallPct: totalT ? Math.round(totalA / totalT * 100) : 0, totalAbsences: totalT - totalA, totalLectures: totalT });
    }
    if (path === '/api/academic/attendance/records' && method === 'GET') {
      const u = sessionUser(); if (!u) return fail(401, 'سجل الدخول أولًا');
      if (u.role !== 'student') return fail(403, 'ليس لديك صلاحية لهذا الإجراء');
      const rows = DB.attendance_records.filter(r => r.student_id === u.id).map(r => {
        const sess = DB.attendance_sessions.find(s => s.id === r.session_id);
        return { attended_at: r.attended_at, lecture_name: sess ? sess.lecture_name : '—', doctor_name: sess ? sess.doctor_name : null };
      }).sort((a, b) => String(b.attended_at).localeCompare(String(a.attended_at))).slice(0, 50);
      return ok(rows);
    }

    // ===== حضور بـ QR =====
    if (path === '/api/attendance/sessions' && method === 'POST') {
      const u = sessionUser(); if (!u) return fail(401, 'سجل الدخول أولًا');
      if (u.role !== 'staff' && u.role !== 'admin') return fail(403, 'ليس لديك صلاحية لهذا الإجراء');
      if (!body.lecture_name || String(body.lecture_name).trim().length < 3) return fail(400, 'اكتب اسم المحاضرة');
      const dur = Math.min(Math.max(Number(body.duration_minutes) || 60, 5), 240);
      let code; do { code = Math.random().toString(16).slice(2, 8).toUpperCase(); } while (DB.attendance_sessions.some(s => s.code === code));
      const sess = { id: nextId(DB.attendance_sessions), lecture_name: String(body.lecture_name).trim(), doctor_name: u.name, code, created_by: u.id, created_at: nowUtc(), expires_at: new Date(Date.now() + dur * 60000).toISOString().slice(0, 19).replace('T', ' '), duration_minutes: dur };
      DB.attendance_sessions.push(sess); saveDb(DB);
      return ok(sess, 201);
    }
    if (path === '/api/attendance/sessions' && method === 'GET') {
      const u = sessionUser(); if (!u) return fail(401, 'سجل الدخول أولًا');
      if (u.role !== 'staff' && u.role !== 'admin') return fail(403, 'ليس لديك صلاحية لهذا الإجراء');
      const now = Date.now();
      let rows = DB.attendance_sessions.slice().sort((a, b) => b.id - a.id).slice(0, 50);
      if (u.role === 'staff') rows = rows.filter(r => r.created_by === u.id);
      return ok(rows.map(r => ({ ...r, attended: DB.attendance_records.filter(x => x.session_id === r.id).length, active: parseUtc(r.expires_at) > new Date(now) })));
    }
    if (path === '/api/attendance/mark' && method === 'POST') {
      const u = sessionUser(); if (!u) return fail(401, 'سجل الدخول أولًا');
      if (u.role !== 'student') return fail(403, 'ليس لديك صلاحية لهذا الإجراء');
      const code = String(body.code || '').toUpperCase().trim();
      if (!code) return fail(400, 'اكتب الكود أولًا');
      const sess = DB.attendance_sessions.find(s => s.code === code);
      if (!sess) return fail(404, 'الكود غير صحيح — تأكد منه مع المحاضر');
      if (parseUtc(sess.expires_at) <= new Date()) return fail(400, 'انتهت صلاحية هذا الرمز — اطلب من المحاضر رمزًا جديدًا');
      if (DB.attendance_records.some(r => r.session_id === sess.id && r.student_id === u.id)) return fail(409, 'تم تسجيل حضورك بالفعل لهذه المحاضرة');
      DB.attendance_records.push({ id: nextId(DB.attendance_records), session_id: sess.id, student_id: u.id, attended_at: nowUtc() });
      saveDb(DB);
      return ok({ lecture_name: sess.lecture_name, attended_at: new Date().toISOString(), attended_count: DB.attendance_records.filter(r => r.session_id === sess.id).length });
    }
    if (path === '/api/attendance/report' && method === 'GET') {
      const u = sessionUser(); if (!u) return fail(401, 'سجل الدخول أولًا');
      if (u.role !== 'staff' && u.role !== 'admin') return fail(403, 'ليس لديك صلاحية لهذا الإجراء');
      const today = new Date().toISOString().slice(0, 10);
      const sessionsToday = DB.attendance_sessions.filter(s => String(s.created_at).slice(0, 10) === today).length;
      const recordsToday = DB.attendance_records.filter(r => String(r.attended_at).slice(0, 10) === today).length;
      return ok({ sessionsToday, recordsToday, totalRecords: DB.attendance_records.length, top: [] });
    }

    // ===== الأولوية يدويًا =====
    const mPrio = path.match(/^\/api\/complaints\/(\d+)\/priority$/);
    if (mPrio && method === 'POST') {
      const u = sessionUser(); if (!u) return fail(401, 'سجل الدخول أولًا');
      if (u.role === 'student') return fail(403, 'ليس لديك صلاحية لهذا الإجراء');
      if (!PRIORITY_VALUES.includes(body.priority)) return fail(400, 'أولوية غير صالحة');
      const c = DB.complaints.find(x => x.id === Number(mPrio[1]));
      if (!c) return fail(404, 'الشكوى غير موجودة');
      if (!canSeeComplaint(u, c)) return fail(403, 'ليست ضمن نطاقك');
      c.priority = body.priority; c.updated_at = nowUtc();
      logUpdate(c.id, u.id, 'priority', `تم تعديل الأولوية يدويًا إلى: ${body.priority}`);
      notify(c.student_id, 'تم تحديث أولوية طلبك', `${c.ticket_no} — الأولوية أصبحت ${body.priority}`, 'complaint', c.id);
      saveDb(DB);
      return ok({ complaint: loadComplaint(c.id) });
    }

    // ===== مسح تقييم (تصحيح إداري) =====
    const mResetRating = path.match(/^\/api\/admin\/complaints\/(\d+)\/reset-rating$/);
    if (mResetRating && method === 'POST') {
      const u = sessionUser(); if (!u) return fail(401, 'سجل الدخول أولًا');
      if (u.role !== 'admin') return fail(403, 'ليس لديك صلاحية لهذا الإجراء');
      const c = DB.complaints.find(x => x.id === Number(mResetRating[1]));
      if (!c) return fail(404, 'الشكوى غير موجودة');
      if (!c.rating) return fail(400, 'لا يوجد تقييم على هذه الشكوى أصلًا');
      logUpdate(c.id, u.id, 'rating_reset', `تم مسح تقييم الطالب (كان ${c.rating}/5) بمعرفة الإدارة`);
      c.rating = null; c.rating_comment = null; c.updated_at = nowUtc(); saveDb(DB);
      return ok({ complaint: loadComplaint(c.id) });
    }

    // ===== تأكيد الطالب على الحل (closure handshake) =====
    const mConfirm = path.match(/^\/api\/complaints\/(\d+)\/confirm$/);
    if (mConfirm && method === 'POST') {
      const u = sessionUser(); if (!u) return fail(401, 'سجل الدخول أولًا');
      if (u.role !== 'student') return fail(403, 'ليس لديك صلاحية لهذا الإجراء');
      const c = DB.complaints.find(x => x.id === Number(mConfirm[1]) && x.student_id === u.id);
      if (!c) return fail(404, 'الشكوى غير موجودة');
      if (!['confirmed', 'rejected'].includes(body.decision)) return fail(400, 'القرار غير صالح');
      if (c.status !== 'resolved') return fail(400, 'لا يمكن تأكيد الحل قبل أن يعلّم الموظف المشكلة كمحلولة');
      if (c.closure_status === 'confirmed') return fail(409, 'تم تأكيد الحل بالفعل');
      if (body.decision === 'confirmed') {
        c.closure_status = 'confirmed'; c.internal_resolution = 'confirmed'; c.updated_at = nowUtc();
        logUpdate(c.id, u.id, 'closure_confirmed', 'الطالب أكّد أن مشكلته اتحلت');
        const ids = new Set([c.assigned_to, ...DB.users.filter(x => x.role === 'admin' && x.active).map(x => x.id)].filter(Boolean));
        for (const t of ids) notify(t, 'الطالب أكّد إغلاق الشكوى ✓', `${c.ticket_no} — الطالب أكّد أن مشكلته اتحلت`, 'complaint', c.id);
      } else {
        const note = String(body.reason || '').trim();
        if (note.length < 5) return fail(400, 'اكتب سبب عدم الحل (5 أحرف+)');
        c.status = 'in_progress'; c.closure_status = null; c.resolved_at = null; c.updated_at = nowUtc();
        logUpdate(c.id, u.id, 'reopened', `الطالب أكّد أن المشكلة اتحلت لا — السبب: ${note.slice(0, 300)}`);
        const ids = new Set([c.assigned_to, ...DB.users.filter(x => x.role === 'admin' && x.active).map(x => x.id)].filter(Boolean));
        for (const t of ids) notify(t, 'الطالب بيقول المشكلة لسه موجودة ❗', `${c.ticket_no} — السبب: ${note.slice(0, 100)}`, 'complaint', c.id);
      }
      saveDb(DB);
      return ok({ complaint: loadComplaint(c.id) });
    }

    // ===== الشؤون تطلب تأكيد الحل من الموظف =====
    const mReqConf = path.match(/^\/api\/complaints\/(\d+)\/request-confirmation$/);
    if (mReqConf && method === 'POST') {
      const u = sessionUser(); if (!u) return fail(401, 'سجل الدخول أولًا');
      if (u.role === 'student') return fail(403, 'ليس لديك صلاحية لهذا الإجراء');
      const c = DB.complaints.find(x => x.id === Number(mReqConf[1]));
      if (!c) return fail(404, 'الشكوى غير موجودة');
      if (!canSeeComplaint(u, c)) return fail(403, 'ليست ضمن نطاقك');
      if (c.internal_resolution === 'requested') return fail(409, 'تم طلب تأكيد الحل بالفعل ولم يرد الموظف بعد');
      c.internal_resolution = 'requested'; c.internal_resolution_note = null; c.updated_at = nowUtc();
      logUpdate(c.id, u.id, 'request_confirmation', 'الشؤون طلبت تأكيد الحل من الموظف المختص');
      DB.messages.push({ id: nextId(DB.messages), complaint_id: c.id, sender_id: u.id, body: '🔔 الشؤون طلبت تأكيد: هل المشكلة اتحلت فعلًا؟ (رد من داخل الشكوى)', is_internal: 1, created_at: nowUtc() });
      const targets = c.assigned_to ? [c.assigned_to] : DB.users.filter(x => x.role === 'staff' && x.department_id === c.department_id && x.active).map(x => x.id);
      for (const t of targets) notify(t, '🔔 الشؤون طلبت تأكيد الحل منك', `${c.ticket_no} — هل المشكلة اتحلت فعلًا؟`, 'complaint', c.id);
      saveDb(DB);
      return ok({ complaint: loadComplaint(c.id) });
    }

    // ===== رد الموظف على طلب الشؤون =====
    const mEmpConf = path.match(/^\/api\/complaints\/(\d+)\/employee-confirm$/);
    if (mEmpConf && method === 'POST') {
      const u = sessionUser(); if (!u) return fail(401, 'سجل الدخول أولًا');
      if (u.role === 'student') return fail(403, 'ليس لديك صلاحية لهذا الإجراء');
      if (!['confirmed', 'not_confirmed'].includes(body.decision)) return fail(400, 'القرار غير صالح');
      const c = DB.complaints.find(x => x.id === Number(mEmpConf[1]));
      if (!c) return fail(404, 'الشكوى غير موجودة');
      if (!canSeeComplaint(u, c)) return fail(403, 'ليست ضمن نطاقك');
      const cleanNote = String(body.note || '').trim().slice(0, 500);
      const confirmed = body.decision === 'confirmed';
      c.internal_resolution = confirmed ? 'confirmed' : 'not_confirmed';
      c.internal_resolution_note = cleanNote || null;
      c.updated_at = nowUtc();
      logUpdate(c.id, u.id, confirmed ? 'employee_confirmed' : 'employee_not_confirmed', cleanNote || (confirmed ? 'الموظف أكّد الحل' : 'الموظف بيقول المشكلة لسه موجودة'));
      if (confirmed) notify(c.student_id, 'الموظف أكّد أن المشكلة اتحلت ✅', `${c.ticket_no} — ${cleanNote || 'تم تأكيد الحل من الموظف المختص'}`, 'complaint', c.id);
      for (const a of DB.users.filter(x => x.role === 'admin' && x.active)) notify(a, confirmed ? 'الموظف أكّد الحل ✅' : 'الموظف بيقول المشكلة لسه ❗', `${c.ticket_no} — ${cleanNote || (confirmed ? 'لا يحتاج تدخل إضافي' : 'يحتاج متابعة')}`, 'complaint', c.id);
      saveDb(DB);
      return ok({ complaint: loadComplaint(c.id) });
    }


    // ===== رضا الطلاب (إدارة) =====
    if (path === '/api/admin/satisfaction' && method === 'GET') {
      const u = sessionUser(); if (!u) return fail(401, 'سجل الدخول أولًا');
      if (u.role !== 'admin') return fail(403, 'ليس لديك صلاحية لهذا الإجراء');
      const rated = DB.complaints.filter(c => c.rating).map(c => ({ ...c, dept: (DB.departments.find(d => d.id === c.department_id) || {}).name }));
      const avg5 = rated.length ? rated.reduce((a, r) => a + r.rating, 0) / rated.length : 0;
      const pct = Math.round(avg5 / 5 * 100);
      const byDeptMap = {};
      for (const r of rated) {
        const d = byDeptMap[r.dept] = byDeptMap[r.dept] || { name: r.dept, sum: 0, count: 0 };
        d.sum += r.rating; d.count++;
      }
      const perDepartment = Object.values(byDeptMap).map(d => ({ name: d.name, avg: Math.round(d.sum / d.count * 10) / 10, pct: Math.round(d.sum / d.count / 5 * 100), count: d.count })).sort((a, b) => b.avg - a.avg);
      const months = {};
      for (const r of rated) { const key = String(r.updated_at).slice(0, 7); const m = months[key] = months[key] || { count: 0, sum: 0 }; m.count++; m.sum += r.rating; }
      const monthly = Object.entries(months).sort((a, b) => a[0].localeCompare(b[0])).slice(-6).map(([month, v]) => ({ month, avg: Math.round(v.sum / v.count * 10) / 10, count: v.count }));
      const recentComments = rated.filter(r => r.rating_comment).sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at))).slice(0, 8).map(r => ({ rating: r.rating, rating_comment: r.rating_comment, dept: r.dept, student_name: (findUser(r.student_id) || {}).name }));
      return ok({ avg: Math.round(avg5 * 10) / 10, satisfactionPct: pct, total: rated.length, perDepartment, monthly, recentComments, best: perDepartment[0] || null, worst: perDepartment[perDepartment.length - 1] || null });
    }

    // ===== المستندات الذكية =====
    if (path === '/api/documents/save' && method === 'POST') {
      const u = sessionUser(); if (!u) return fail(401, 'سجل الدخول أولًا');
      if (u.role !== 'student') return fail(403, 'ليس لديك صلاحية لهذا الإجراء');
      if (!body.filename || !body.doc_type) return fail(400, 'بيانات المستند غير مكتملة');
      const doc = { id: nextId(DB.document_analyses), user_id: u.id, filename: String(body.filename).slice(0, 200), doc_type: String(body.doc_type).slice(0, 80), extracted: String(body.extracted || '').slice(0, 6000), missing: Array.isArray(body.missing) ? body.missing.join('، ').slice(0, 500) : String(body.missing || '').slice(0, 500), status: body.status === 'complete' ? 'complete' : 'incomplete', created_at: nowUtc() };
      DB.document_analyses.push(doc); saveDb(DB);
      return ok(doc, 201);
    }
    if (path === '/api/documents/my' && method === 'GET') {
      const u = sessionUser(); if (!u) return fail(401, 'سجل الدخول أولًا');
      if (u.role !== 'student') return fail(403, 'ليس لديك صلاحية لهذا الإجراء');
      return ok(DB.document_analyses.filter(d => d.user_id === u.id).slice(-30).reverse());
    }
    const mDoc = path.match(/^\/api\/documents\/(\d+)$/);
    if (mDoc && method === 'DELETE') {
      const u = sessionUser(); if (!u) return fail(401, 'سجل الدخول أولًا');
      DB.document_analyses = DB.document_analyses.filter(d => !(d.id === Number(mDoc[1]) && d.user_id === u.id));
      saveDb(DB);
      return ok({ deleted: Number(mDoc[1]) });
    }

    // ===== المفقودات والموجودات =====
    if (path === '/api/lost-found' && method === 'GET') {
      const u = sessionUser(); if (!u) return fail(401, 'سجل الدخول أولًا');
      const p = query;
      let rows = DB.lost_found.map(x => ({ ...x, owner_name: (findUser(x.student_id) || {}).name }));
      if (p.type) rows = rows.filter(x => x.type === p.type);
      if (p.status) rows = rows.filter(x => x.status === p.status);
      if (p.category) rows = rows.filter(x => x.category === p.category);
      if (p.q) { const q2 = String(p.q).toLowerCase(); rows = rows.filter(x => [x.title, x.description, x.location].some(v => String(v || '').toLowerCase().includes(q2))); }
      rows.sort((a, b) => (a.status === 'open' ? 0 : 1) - (b.status === 'open' ? 0 : 1) || String(b.created_at).localeCompare(String(a.created_at)));
      return ok(rows.slice(0, 100).map(x => ({ ...x, can_edit: x.student_id === u.id || u.role !== 'student' })));
    }
    if (path === '/api/lost-found' && method === 'POST') {
      const u = sessionUser(); if (!u) return fail(401, 'سجل الدخول أولًا');
      if (u.role !== 'student') return fail(403, 'ليس لديك صلاحية لهذا الإجراء');
      if (!['lost', 'found'].includes(body.type)) return fail(400, 'حدد نوع الإعلان');
      if (!body.title || String(body.title).trim().length < 4) return fail(400, 'اكتب عنوانًا واضحًا (4 أحرف+)');
      if (body.image && !(String(body.image).startsWith('data:image/') && String(body.image).length < 3500000) && !String(body.image).startsWith('/uploads/')) return fail(400, 'الصورة غير صالحة أو أكبر من 2.5MB');
      const item = { id: nextId(DB.lost_found), student_id: u.id, type: body.type, title: String(body.title).trim(), description: String(body.description || '').trim().slice(0, 1500) || null, category: body.category || 'أخرى', location: String(body.location || '').trim() || null, item_date: body.item_date || new Date().toISOString().slice(0, 10), image: body.image || null, status: 'open', created_at: nowUtc() };
      DB.lost_found.push(item); saveDb(DB);
      return ok(item, 201);
    }
    const mLfStatus = path.match(/^\/api\/lost-found\/(\d+)\/status$/);
    if (mLfStatus && method === 'PATCH') {
      const u = sessionUser(); if (!u) return fail(401, 'سجل الدخول أولًا');
      if (!['open', 'found', 'returned'].includes(body.status)) return fail(400, 'حالة غير صالحة');
      const item = DB.lost_found.find(x => x.id === Number(mLfStatus[1]));
      if (!item) return fail(404, 'الإعلان غير موجود');
      if (item.student_id !== u.id && u.role === 'student') return fail(403, 'يمكنك تعديل إعلاناتك فقط');
      item.status = body.status; saveDb(DB);
      return ok(item);
    }
    const mLfContact = path.match(/^\/api\/lost-found\/(\d+)\/contact$/);
    if (mLfContact && method === 'POST') {
      const u = sessionUser(); if (!u) return fail(401, 'سجل الدخول أولًا');
      if (!body.message || String(body.message).trim().length < 3) return fail(400, 'اكتب رسالتك');
      const item = DB.lost_found.find(x => x.id === Number(mLfContact[1]));
      if (!item) return fail(404, 'الإعلان غير موجود');
      DB.lost_found_contacts.push({ id: nextId(DB.lost_found_contacts), item_id: item.id, user_id: u.id, message: String(body.message).trim().slice(0, 1000), created_at: nowUtc() });
      if (item.student_id !== u.id) notify(item.student_id, `رسالة بخصوص "${item.title.slice(0, 40)}"`, `${u.name}: ${String(body.message).trim().slice(0, 100)}`, 'lostfound', item.id);
      else for (const a of DB.users.filter(x => ['staff', 'admin'].includes(x.role) && x.active)) notify(a.id, `تواصل بخصوص إعلان "${item.title.slice(0, 40)}"`, `${u.name}: ${String(body.message).trim().slice(0, 100)}`, 'lostfound', item.id);
      saveDb(DB);
      return ok({ ok: true });
    }
    const mLfContacts = path.match(/^\/api\/lost-found\/(\d+)\/contacts$/);
    if (mLfContacts && method === 'GET') {
      const u = sessionUser(); if (!u) return fail(401, 'سجل الدخول أولًا');
      const item = DB.lost_found.find(x => x.id === Number(mLfContacts[1]));
      if (!item) return fail(404, 'الإعلان غير موجود');
      if (item.student_id !== u.id && u.role === 'student') return fail(403, 'لا تملك صلاحية');
      return ok(DB.lost_found_contacts.filter(c => c.item_id === item.id).map(c => ({ ...c, sender_name: (findUser(c.user_id) || {}).name, sender_role: (findUser(c.user_id) || {}).role })));
    }
    const mLfDel = path.match(/^\/api\/lost-found\/(\d+)$/);
    if (mLfDel && method === 'DELETE') {
      const u = sessionUser(); if (!u) return fail(401, 'سجل الدخول أولًا');
      const item = DB.lost_found.find(x => x.id === Number(mLfDel[1]));
      if (!item) return fail(404, 'الإعلان غير موجود');
      if (item.student_id !== u.id && u.role === 'student') return fail(403, 'يمكنك حذف إعلاناتك فقط');
      DB.lost_found = DB.lost_found.filter(x => x.id !== item.id);
      saveDb(DB);
      return ok({ deleted: item.id });
    }

    // ===== الإعلانات الجامعية =====
    if (path === '/api/announcements' && method === 'GET') {
      const u = sessionUser(); if (!u) return fail(401, 'سجل الدخول أولًا');
      return ok(DB.announcements.slice().sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 10).map(a => ({ ...a, admin_name: (findUser(a.admin_id) || {}).name })));
    }
    if (path === '/api/admin/announcements' && method === 'POST') {
      const u = sessionUser(); if (!u) return fail(401, 'سجل الدخول أولًا');
      if (u.role !== 'admin') return fail(403, 'ليس لديك صلاحية لهذا الإجراء');
      if (!body.title || !body.body || String(body.title).trim().length < 4 || String(body.body).trim().length < 10) return fail(400, 'اكتب عنوان (4+ أحرف) ونص (10+ أحرف)');
      const ann = { id: nextId(DB.announcements), admin_id: u.id, title: String(body.title).trim(), body: String(body.body).trim(), audience: 'all', created_at: nowUtc() };
      DB.announcements.push(ann);
      for (const x of DB.users.filter(x => x.active && ['student', 'staff'].includes(x.role))) notify(x.id, '📢 إعلان جامعي جديد', String(body.title).trim().slice(0, 120), 'announcement', ann.id);
      saveDb(DB);
      return ok(ann, 201);
    }
    const mAnnDel = path.match(/^\/api\/admin\/announcements\/(\d+)$/);
    if (mAnnDel && method === 'DELETE') {
      const u = sessionUser(); if (!u) return fail(401, 'سجل الدخول أولًا');
      if (u.role !== 'admin') return fail(403, 'ليس لديك صلاحية لهذا الإجراء');
      DB.announcements = DB.announcements.filter(a => a.id !== Number(mAnnDel[1]));
      saveDb(DB);
      return ok({ deleted: Number(mAnnDel[1]) });
    }

    // ===== اسأل الإدارة (AI) =====
    if (path === '/api/admin/ask' && method === 'POST') {
      const u = sessionUser(); if (!u) return fail(401, 'سجل الدخول أولًا');
      if (u.role !== 'admin') return fail(403, 'ليس لديك صلاحية لهذا الإجراء');
      const qText = String(body.question || '').trim();
      if (qText.length < 3) return fail(400, 'اكتب السؤال');
      return ok(adminAsk(qText));
    }


    return fail(404, 'هذا الـ endpoint غير موجود (static demo)');
  }
  // ===== الواجهة العامة التي تستدعيها كل الصفحات =====
  window.nexusLocalApi = async function (url, options = {}) {
    const method = (options.method || 'GET').toUpperCase();
    const u = new URL(url, 'http://localhost');
    const path = decodeURIComponent(u.pathname);
    const query = Object.fromEntries(u.searchParams);
    let body = {};
    if (options.body) {
      try { body = JSON.parse(options.body); } catch { body = {}; }
    }
    try {
      const res = await route(method, path, query, body);
      return res;
    } catch (e) {
      console.error('[nexus-static]', e);
      return fail(500, 'خطأ داخلي في الديمو المحلي');
    }
  };
})();
