/**
 * Traduction FR / AR.
 *
 * Le dictionnaire arabe est typé sur les clés du dictionnaire français : une
 * clé oubliée ne compile pas. La direction (RTL) est portée par `<html dir>`,
 * donc la mise en page suit sans code spécifique.
 */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type Lang = 'fr' | 'ar'

const fr = {
  'app.title': 'Gestion des pesées',
  'app.station': 'Poste',
  'nav.balance1': '1re balance',
  'nav.balance2': '2e balance',
  'nav.tickets': 'Tickets',
  'nav.settings': 'Paramètres',
  'nav.logout': 'Déconnexion',

  'common.save': 'Enregistrer',
  'common.cancel': 'Annuler',
  'common.refresh': 'Rafraîchir',
  'common.search': 'Rechercher…',
  'common.loading': 'Chargement…',
  'common.confirm': 'Confirmer',
  'common.close': 'Fermer',
  'common.all': 'Tous',
  'common.detected': 'Ports détectés',
  'common.optional': 'facultatif',
  'common.required': 'champ obligatoire',

  'login.title': 'Connexion',
  'login.username': 'Identifiant',
  'login.password': 'Mot de passe',
  'login.submit': 'Se connecter',
  'login.setup': 'Première installation : configurer la base de données',
  'login.hint':
    'Après « Créer / mettre à jour les tables », le compte par défaut est admin / admin.',

  'db.title': 'Base de données MySQL',
  'db.host': 'Serveur',
  'db.port': 'Port',
  'db.user': 'Utilisateur',
  'db.password': 'Mot de passe',
  'db.database': 'Base',
  'db.test': 'Tester et connecter',
  'db.migrate': 'Créer / mettre à jour les tables',
  'db.connected': 'Connecté',
  'db.disconnected': 'Non connecté',
  'db.notConfigured': 'Non configurée',

  'bal.title': 'Balance série',
  'bal.port': 'Port série',
  'bal.baud': 'Débit (bauds)',
  'bal.dataBits': 'Bits de données',
  'bal.parity': 'Parité',
  'bal.stopBits': 'Bits d’arrêt',
  'bal.request': 'Requête (hex)',
  'bal.requestHint': 'ex. 0D — vide : la balance émet en continu',
  'bal.pollMs': 'Période de requête (ms)',
  'bal.frameRegex': 'Regex de trame',
  'bal.decimalSep': 'Séparateur décimal',
  'bal.unit': 'Unité',
  'bal.stableMs': 'Durée de stabilité (ms)',
  'bal.stableEpsilon': 'Tolérance de stabilité (kg)',
  'bal.uiHz': 'Rafraîchissement (Hz)',
  'bal.detect': 'Détecter les ports',
  'bal.start': 'Démarrer',
  'bal.stop': 'Arrêter',
  'bal.running': 'En marche',
  'bal.stopped': 'Arrêtée',
  'bal.testWeight': 'Poids instantané',
  'bal.simulate': 'Mode simulateur (poids fictifs, sans balance)',
  'bal.simulateHint':
    'Aucun port série n’est ouvert. À désactiver sur le poste de pesée. Utilisez une base de test : les pesées enregistrées seraient fictives.',
  'sim.banner': 'Mode simulateur : poids fictifs. Ne pas utiliser sur la base de production.',
  'sim.weight': 'Poids à poser (kg)',
  'sim.place': 'Poser sur le pont',
  'sim.empty': 'Pont vide (0)',
  'sim.hint':
    'Sans consigne, un camion fictif arrive tout seul. Un poids posé ici est tenu jusqu’à la prochaine consigne.',
  'bal.hint':
    'Le flux brut reçu est affiché à droite : il permet de vérifier la regex de trame sans deviner.',

  'station.newTicket': 'Nouveau ticket',
  'station.openTicket': 'Ouvrir le ticket',
  'station.ticket': 'Ticket',
  'station.plate': 'Matricule',
  'station.driver': 'Chauffeur',
  'station.partner': 'Tiers / client / fournisseur',
  'station.blNo': 'N° BL',
  'station.weightSupposed': 'Poids supposé (kg)',
  'station.locationFrom': 'Lieu de départ',
  'station.locationTo': 'Lieu d’arrivée',
  'station.notes': 'Remarques',
  'station.outside': 'Extérieur à la société',
  'station.firstWeigh': '1re pesée',
  'station.secondWeigh': '2e pesée',
  'station.capture': 'Capturer',
  'station.weight': 'Poids',
  'station.stable': 'Stable',
  'station.unstable': 'En mouvement',
  'station.autoCapture': 'Capture automatique',
  'station.force': 'Forcer la capture (poids instable)',
  'station.net': 'Net',
  'station.tare': 'Tare',
  'station.gross': 'Brut',
  'station.ecart': 'Écart',
  'station.tolerance': 'tolérance',
  'station.ecartOk': 'Conforme',
  'station.ecartKo': 'Hors tolérance',
  'station.closed': 'Ticket enregistré. Ouvrez un nouveau ticket pour continuer.',
  'station.readyToSave': 'Les deux pesées sont faites. Enregistrez le ticket pour continuer.',
  'station.save': 'Enregistrer le ticket',
  'station.confirmSave': 'Confirmer l’enregistrement de {ticket} ?',
  'station.print': 'Imprimer le ticket',
  'station.preview': 'Aperçu du ticket',
  'station.nextWeigh': 'Prochaine pesée : {kind}',
  'station.waitStable': 'Attendre la stabilité',
  'station.noSample': 'Aucune mesure reçue',
  'station.type.ENTREE': 'Entrée',
  'station.type.SORTIE': 'Sortie',
  'station.type.TRANSFERT': 'Transfert',
  'station.type.TIERS': 'Pesée tiers',
  'station.hint.ENTREE': 'Marchandise qui ENTRE dans la société',
  'station.hint.SORTIE': 'Marchandise qui SORT de la société',
  'station.hint.TRANSFERT': 'Marchandise déplacée entre deux lieux',
  'station.hint.TIERS': 'Pesée pour une personne extérieure',
  'bal1.productLater': 'Le produit et la quantité se saisissent à la 2e balance.',
  'lines.incomplete': 'Chaque produit doit avoir un nom et une quantité.',
  'cap.manual': 'Saisir le poids à la main (balance en panne)',
  'cap.manualWeight': 'Poids tapé (kg)',
  'station.manualMark': 'M = pesée manuelle',
  'bal.redo': 'Refaire la 1re pesée',
  'bal.redoCapture': 'Enregistrer la nouvelle 1re pesée',
  'bal.redoHint':
    'Le camion est repassé sur la balance : le nouveau poids remplace {weight}. L’ancien reste conservé dans l’historique. Réimprimez ensuite le bon.',
  'station.kind.TARE': 'Tare (à vide)',
  'station.kind.BRUT': 'Brut (chargé)',

  'bal1.title': '1re balance — première pesée',
  'bal1.hint':
    'Le camion arrive : matricule, chauffeur, puis pesée. Le ticket est créé et enregistré à ce moment-là, donc imprimable tout de suite. Le reste se complète à la 2e balance.',
  'bal1.capture': 'Capturer et enregistrer la 1re pesée',
  'bal1.printFirst': 'Imprimer le bon n° 1',
  'bal1.done': '1re pesée enregistrée : ticket primaire. Passez à la 2e balance pour le compléter.',
  'bal1.new': 'Nouveau camion',

  'bal2.title': '2e balance — pesée finale',
  'bal2.pending': 'Tickets en attente de la 2e pesée',
  'bal2.none': 'Aucun ticket en attente. Passez d’abord par la 1re balance.',
  'bal2.choose': 'Choisir',
  'bal2.complete': 'Compléter le ticket',
  'bal2.saveInfo': 'Enregistrer les informations',
  'bal2.infoSaved': 'Informations enregistrées.',
  'bal2.capture': 'Capturer la 2e pesée',
  'bal2.back': 'Retour aux tickets en attente',
  'bal2.needLines': 'Ajoutez au moins un produit avant la 2e pesée.',

  'lines.title': 'Produits',
  'lines.product': 'Produit',
  'lines.quantity': 'Quantité (kg)',
  'lines.remove': 'Retirer',
  'lines.add': 'Ajouter un produit',
  'lines.total': 'Total supposé',
  'lines.hint':
    'Une ligne par produit : « 1 t de CMV X » + « 4 t de CMV Y ». Le total devient le poids supposé.',
  'lines.empty': 'Aucun produit',

  'ops.title': 'Tickets de pesée',
  'ops.date': 'Date',
  'ops.empty': 'Aucun ticket',
  'ops.primary': 'Primaire',
  'ops.final': 'Final',
  'ops.products': 'Produits',
  'ops.cancelTitle': 'Motif d’annulation',
  'ops.edit': 'Modifier',
  'ops.editTitle': 'Modifier le ticket',
  'ops.print': 'Imprimer',
  'ops.preview': 'Aperçu',
  'ticket.previewTitle': 'Aperçu avant impression',
  'ops.status.OUVERTE': 'Ouverte',
  'ops.status.FERMEE': 'Fermée',
  'ops.status.ANNULEE': 'Annulée',

  'settings.title': 'Paramètres',
  'settings.saved': 'Enregistré',
  'settings.company': 'Société',
  'settings.companyName': 'Nom imprimé sur les tickets',
  'settings.app': 'Application',
  'settings.version': 'Version',
  'settings.adminWarning':
    'Le compte par défaut admin / admin est encore actif : changez-le avant toute utilisation réelle.'
} as const

export type TKey = keyof typeof fr

const ar: Record<TKey, string> = {
  'app.title': 'إدارة الأوزان',
  'app.station': 'المحطة',
  'nav.balance1': 'الوزن الأول',
  'nav.balance2': 'الوزن الثاني',
  'nav.tickets': 'التذاكر',
  'nav.settings': 'الإعدادات',
  'nav.logout': 'تسجيل الخروج',

  'common.save': 'حفظ',
  'common.cancel': 'إلغاء',
  'common.refresh': 'تحديث',
  'common.search': 'بحث…',
  'common.loading': 'جار التحميل…',
  'common.confirm': 'تأكيد',
  'common.close': 'إغلاق',
  'common.all': 'الكل',
  'common.detected': 'المنافذ المكتشفة',
  'common.optional': 'اختياري',
  'common.required': 'حقل إلزامي',

  'login.title': 'تسجيل الدخول',
  'login.username': 'اسم المستخدم',
  'login.password': 'كلمة السر',
  'login.submit': 'دخول',
  'login.setup': 'التثبيت الأول: إعداد قاعدة البيانات',
  'login.hint': 'بعد « إنشاء / تحديث الجداول »، الحساب الافتراضي هو admin / admin.',

  'db.title': 'قاعدة بيانات MySQL',
  'db.host': 'الخادم',
  'db.port': 'المنفذ',
  'db.user': 'المستخدم',
  'db.password': 'كلمة السر',
  'db.database': 'قاعدة البيانات',
  'db.test': 'اختبار واتصال',
  'db.migrate': 'إنشاء / تحديث الجداول',
  'db.connected': 'متصل',
  'db.disconnected': 'غير متصل',
  'db.notConfigured': 'غير مُهيّأة',

  'bal.title': 'الميزان التسلسلي',
  'bal.port': 'المنفذ التسلسلي',
  'bal.baud': 'معدل البود',
  'bal.dataBits': 'بتات البيانات',
  'bal.parity': 'التكافؤ',
  'bal.stopBits': 'بتات الإيقاف',
  'bal.request': 'طلب (hex)',
  'bal.requestHint': 'مثال 0D — فارغ: الميزان يرسل باستمرار',
  'bal.pollMs': 'دورة الطلب (مللي ثانية)',
  'bal.frameRegex': 'نمط الإطار',
  'bal.decimalSep': 'الفاصل العشري',
  'bal.unit': 'الوحدة',
  'bal.stableMs': 'مدة الاستقرار (مللي ثانية)',
  'bal.stableEpsilon': 'تفاوت الاستقرار (كغ)',
  'bal.uiHz': 'معدل التحديث (هرتز)',
  'bal.detect': 'كشف المنافذ',
  'bal.start': 'تشغيل',
  'bal.stop': 'إيقاف',
  'bal.running': 'يعمل',
  'bal.stopped': 'متوقف',
  'bal.testWeight': 'الوزن الحالي',
  'bal.simulate': 'وضع المحاكاة (أوزان وهمية، بدون ميزان)',
  'bal.simulateHint':
    'لا يتم فتح أي منفذ تسلسلي. يجب تعطيله على محطة الوزن. استخدم قاعدة بيانات تجريبية: الأوزان المسجلة ستكون وهمية.',
  'sim.banner': 'وضع المحاكاة: أوزان وهمية. لا تستخدمه على قاعدة بيانات الإنتاج.',
  'sim.weight': 'الوزن المراد وضعه (كغ)',
  'sim.place': 'ضع على الميزان',
  'sim.empty': 'ميزان فارغ (0)',
  'sim.hint':
    'بدون تحديد، تصل شاحنة وهمية تلقائياً. الوزن الموضوع هنا يبقى ثابتاً حتى التعليمة التالية.',
  'bal.hint': 'يظهر التدفق الخام على اليسار للتحقق من نمط الإطار دون تخمين.',

  'station.newTicket': 'تذكرة جديدة',
  'station.openTicket': 'فتح التذكرة',
  'station.ticket': 'التذكرة',
  'station.plate': 'الترقيم',
  'station.driver': 'السائق',
  'station.partner': 'الغير / العميل / المورد',
  'station.blNo': 'رقم الوصل',
  'station.weightSupposed': 'الوزن المفترض (كغ)',
  'station.locationFrom': 'مكان الانطلاق',
  'station.locationTo': 'مكان الوصول',
  'station.notes': 'ملاحظات',
  'station.outside': 'خارج الشركة',
  'station.firstWeigh': 'الوزن الأول',
  'station.secondWeigh': 'الوزن الثاني',
  'station.capture': 'تسجيل',
  'station.weight': 'الوزن',
  'station.stable': 'مستقر',
  'station.unstable': 'في حركة',
  'station.autoCapture': 'تسجيل تلقائي',
  'station.force': 'إجبار التسجيل (وزن غير مستقر)',
  'station.net': 'الصافي',
  'station.tare': 'الفارغ',
  'station.gross': 'الإجمالي',
  'station.ecart': 'الفارق',
  'station.tolerance': 'السماحية',
  'station.ecartOk': 'مطابق',
  'station.ecartKo': 'خارج السماحية',
  'station.closed': 'تم حفظ التذكرة. افتح تذكرة جديدة للمتابعة.',
  'station.readyToSave': 'تم إجراء الوزنين. احفظ التذكرة للمتابعة.',
  'station.save': 'حفظ التذكرة',
  'station.confirmSave': 'تأكيد حفظ {ticket}؟',
  'station.print': 'طباعة التذكرة',
  'station.preview': 'معاينة التذكرة',
  'station.nextWeigh': 'الوزن التالي: {kind}',
  'station.waitStable': 'انتظر الاستقرار',
  'station.noSample': 'لم يتم استلام أي قياس',
  'station.type.ENTREE': 'دخول',
  'station.type.SORTIE': 'خروج',
  'station.type.TRANSFERT': 'تحويل',
  'station.type.TIERS': 'وزن الغير',
  'station.hint.ENTREE': 'بضاعة تدخل إلى الشركة',
  'station.hint.SORTIE': 'بضاعة تخرج من الشركة',
  'station.hint.TRANSFERT': 'بضاعة تنتقل بين مكانين',
  'station.hint.TIERS': 'وزن لشخص خارجي',
  'bal1.productLater': 'يتم إدخال المنتج والكمية عند الميزان الثاني.',
  'lines.incomplete': 'يجب أن يحتوي كل منتج على اسم وكمية.',
  'cap.manual': 'إدخال الوزن يدوياً (الميزان معطل)',
  'cap.manualWeight': 'الوزن المدخل (كغ)',
  'station.manualMark': 'M = وزن يدوي',
  'bal.redo': 'إعادة الوزن الأول',
  'bal.redoCapture': 'تسجيل الوزن الأول الجديد',
  'bal.redoHint':
    'عادت الشاحنة إلى الميزان: الوزن الجديد يعوّض {weight}. يبقى الوزن القديم محفوظاً في السجل. أعد طباعة التذكرة بعد ذلك.',
  'station.kind.TARE': 'الفارغ (بدون حمولة)',
  'station.kind.BRUT': 'الإجمالي (محمّل)',

  'bal1.title': 'الميزان الأول — الوزن الأول',
  'bal1.hint':
    'يصل الشاحن: الترقيم، السائق، ثم الوزن. تُنشأ التذكرة وتُحفظ في هذه اللحظة، فتكون قابلة للطباعة فوراً. الباقي يُكمَل في الميزان الثاني.',
  'bal1.capture': 'تسجيل الوزن الأول وحفظه',
  'bal1.printFirst': 'طباعة تذكرة رقم 1',
  'bal1.done': 'تم تسجيل الوزن الأول: تذكرة أولية. أكملها في الميزان الثاني.',
  'bal1.new': 'شاحن جديد',

  'bal2.title': 'الميزان الثاني — الوزن النهائي',
  'bal2.pending': 'تذاكر في انتظار الوزن الثاني',
  'bal2.none': 'لا توجد تذاكر في الانتظار. ابدأ من الميزان الأول.',
  'bal2.choose': 'اختيار',
  'bal2.complete': 'إكمال التذكرة',
  'bal2.saveInfo': 'حفظ المعلومات',
  'bal2.infoSaved': 'تم حفظ المعلومات.',
  'bal2.capture': 'تسجيل الوزن الثاني',
  'bal2.back': 'رجوع إلى التذاكر المنتظرة',
  'bal2.needLines': 'أضف منتجاً واحداً على الأقل قبل الوزن الثاني.',

  'lines.title': 'المنتجات',
  'lines.product': 'المنتج',
  'lines.quantity': 'الكمية (كغ)',
  'lines.remove': 'حذف',
  'lines.add': 'إضافة منتج',
  'lines.total': 'المجموع المقدّر',
  'lines.hint': 'سطر لكل منتج: « 1 طن من CMV X » + « 4 طن من CMV Y ». المجموع يصبح الوزن المقدّر.',
  'lines.empty': 'لا توجد منتجات',

  'ops.title': 'تذاكر الوزن',
  'ops.date': 'التاريخ',
  'ops.empty': 'لا توجد تذاكر',
  'ops.primary': 'أولية',
  'ops.final': 'نهائية',
  'ops.products': 'المنتجات',
  'ops.cancelTitle': 'سبب الإلغاء',
  'ops.edit': 'تعديل',
  'ops.editTitle': 'تعديل التذكرة',
  'ops.print': 'طباعة',
  'ops.preview': 'معاينة',
  'ticket.previewTitle': 'معاينة قبل الطباعة',
  'ops.status.OUVERTE': 'مفتوحة',
  'ops.status.FERMEE': 'مغلقة',
  'ops.status.ANNULEE': 'ملغاة',

  'settings.title': 'الإعدادات',
  'settings.saved': 'تم الحفظ',
  'settings.company': 'الشركة',
  'settings.companyName': 'الاسم المطبوع على التذاكر',
  'settings.app': 'التطبيق',
  'settings.version': 'الإصدار',
  'settings.adminWarning':
    'الحساب الافتراضي admin / admin ما زال مُفعّلاً: غيّره قبل الاستخدام الحقيقي.'
}

const DICTS: Record<Lang, Record<TKey, string>> = { fr, ar }

interface I18nValue {
  lang: Lang
  setLang: (lang: Lang) => void
  dir: 'ltr' | 'rtl'
  t: (key: TKey, vars?: Record<string, string | number>) => string
}

const I18nContext = createContext<I18nValue | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>('fr')

  useEffect(() => {
    document.documentElement.lang = lang
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
  }, [lang])

  const value = useMemo<I18nValue>(
    () => ({
      lang,
      setLang,
      dir: lang === 'ar' ? 'rtl' : 'ltr',
      t: (key, vars) => {
        let text: string = DICTS[lang][key]
        for (const [name, replacement] of Object.entries(vars ?? {})) {
          text = text.replace(`{${name}}`, String(replacement))
        }
        return text
      }
    }),
    [lang]
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext)
  if (!value) throw new Error('useI18n appelé hors de I18nProvider')
  return value
}
